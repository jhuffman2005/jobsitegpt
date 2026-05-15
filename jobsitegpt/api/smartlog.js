import { createClient } from "@supabase/supabase-js";

// Pulls a short weather string from wttr.in for the project location.
// Returns null if location is missing or the upstream call fails — the log
// generation should still work without weather.
async function fetchWeather(location) {
  if (!location || !location.trim()) return null;
  try {
    const url = `https://wttr.in/${encodeURIComponent(location.trim())}?format=%25C+%25t+%25h+humidity`;
    const res = await fetch(url, {
      headers: { "User-Agent": "curl/7.68" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text || text.length > 120) return null;
    if (/unknown location|sorry|error/i.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    project_id,
    project_name,
    project_location,
    log_date,
    raw_notes,
    deliveries,
    visitors,
    safety,
    inspections,
    // Cross-reference inputs (Prompt 5B). Either may be missing/empty.
    // scope_line_items: [{ id, tradeName, description }] — incomplete only.
    // schedule_tasks:   [{ id, task, phase, startDay, endDay }] — incomplete only.
    scope_line_items,
    schedule_tasks,
  } = req.body || {};

  if (!log_date || !raw_notes?.trim()) {
    return res.status(400).json({ error: "log_date and raw_notes are required" });
  }

  const scopeItems = Array.isArray(scope_line_items) ? scope_line_items : [];
  const schedTasks = Array.isArray(schedule_tasks) ? schedule_tasks : [];
  const hasCrossRef = scopeItems.length > 0 || schedTasks.length > 0;

  // Service-role Supabase client so we can read prior logs server-side
  // regardless of which user is calling. We still scope by project_id.
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let priorLogs = [];
  if (project_id && supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data } = await supabase
        .from("smart_logs")
        .select("log_date, generated_log")
        .eq("project_id", project_id)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);
      priorLogs = data || [];
    } catch (e) {
      console.warn("Prior log fetch failed:", e.message);
    }
  }

  const weather = await fetchWeather(project_location);

  const priorLogsBlock = priorLogs.length
    ? priorLogs.map((l) => `--- ${l.log_date} ---\n${l.generated_log || ""}`).join("\n\n")
    : "(none — this is the first log for this project)";

  // Cross-reference blocks — only inserted into the prompt when lists are
  // non-empty. The AI is instructed to suggest IDs from these exact lists,
  // and the server defensively filters returned IDs against them.
  const scopeBlock = scopeItems.length
    ? scopeItems
        .map((s) => `  - ${s.id} | ${s.tradeName || "—"} | ${s.description || ""}`)
        .join("\n")
    : "(none)";
  const schedBlock = schedTasks.length
    ? schedTasks
        .map((t) => `  - ${t.id} | ${t.phase || "—"} | ${t.task || ""} | Day ${t.startDay}–${t.endDay}`)
        .join("\n")
    : "(none)";

  const crossRefBlock = hasCrossRef
    ? `

Incomplete scope line items for this project (id | trade | description):
${scopeBlock}

Incomplete schedule tasks for this project (id | phase | task | day range):
${schedBlock}`
    : "";

  const crossRefInstructions = hasCrossRef
    ? `
- Cross-reference the super's note against the lists above. Identify which scope line items and schedule tasks the daily report actually describes work on. Return their IDs in suggested_scope_completions and suggested_schedule_completions.
- Be conservative — only suggest an item if the report genuinely indicates work on it. Better to under-suggest than to suggest something the super didn't mention. Empty arrays are fine.
- For schedule_notes: include short plain-language variance notes only when a suggested schedule task is being completed off its planned day range (e.g. "Framing completed Day 14 — schedule projected Day 12, 2 days behind"). Empty array otherwise.`
    : `
- The suggested_scope_completions, suggested_schedule_completions, and schedule_notes fields must be empty arrays — no project scope/schedule was provided for cross-reference.`;

  const userPrompt = `Date: ${log_date}
Project: ${project_name || "Construction Project"}
Weather: ${weather || "Not available"}

Superintendent's notes: ${raw_notes}

Quick checks:
- Deliveries: ${deliveries?.trim() || "None"}
- Visitors: ${visitors?.trim() || "None"}
- Safety incidents: ${safety?.trim() || "No incidents"}
- Inspections: ${inspections?.trim() || "None"}

Prior log entries for context:
${priorLogsBlock}${crossRefBlock}

Instructions:
- Write in professional construction daily log format
- Weave in all quick check details naturally
- Reference prior logs where relevant (continuity, delays, milestones)
- If the same issue appears in 3 or more prior logs, add a "Recurring Note:" line flagging it
- Keep it factual, clear, and professional
- Do not invent details not provided${crossRefInstructions}
- Return ONLY valid JSON in this exact shape — no preamble, no markdown code fences:
{
  "generated_log": "the formatted daily log narrative as a plain string",
  "suggested_scope_completions": ["line_item_id", ...],
  "suggested_schedule_completions": ["task_id", ...],
  "schedule_notes": ["string", ...]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        system:
          "You are a professional construction log writer. Write formal daily log entries that a general contractor would file with the project record.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Anthropic error:", JSON.stringify(data));
      return res.status(response.status).json({ error: data?.error?.message || "AI generation failed" });
    }

    const raw = data.content?.find((b) => b.type === "text")?.text?.trim() || "";

    // Parse the AI's JSON. Strip any markdown fences defensively. On parse
    // failure, fall back to using the raw text as the log with empty
    // suggestion arrays — a cross-reference failure must never block the
    // core log generation.
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch {}

    let generated_log = "";
    let suggested_scope_completions = [];
    let suggested_schedule_completions = [];
    let schedule_notes = [];
    let cross_ref_ok = true;

    if (parsed && typeof parsed === "object" && typeof parsed.generated_log === "string") {
      generated_log = parsed.generated_log.trim();
      suggested_scope_completions = Array.isArray(parsed.suggested_scope_completions) ? parsed.suggested_scope_completions : [];
      suggested_schedule_completions = Array.isArray(parsed.suggested_schedule_completions) ? parsed.suggested_schedule_completions : [];
      schedule_notes = Array.isArray(parsed.schedule_notes) ? parsed.schedule_notes.filter((s) => typeof s === "string") : [];
    } else {
      // Graceful degradation: use raw text as the log, empty suggestions.
      generated_log = raw;
      cross_ref_ok = false;
    }

    if (!generated_log) {
      return res.status(500).json({ error: "AI returned an empty log" });
    }

    // Guard against ID hallucination — discard any returned IDs that weren't
    // in the input lists. The model is told to use exact IDs but we don't
    // trust it.
    const validScopeIds = new Set(scopeItems.map((s) => s.id));
    const validSchedIds = new Set(schedTasks.map((t) => t.id));
    suggested_scope_completions = suggested_scope_completions.filter((id) => validScopeIds.has(id));
    suggested_schedule_completions = suggested_schedule_completions.filter((id) => validSchedIds.has(id));

    return res.status(200).json({
      generated_log,
      weather,
      prior_logs_count: priorLogs.length,
      suggested_scope_completions,
      suggested_schedule_completions,
      schedule_notes,
      cross_ref_ok,
    });
  } catch (err) {
    console.error("SmartLog generation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
