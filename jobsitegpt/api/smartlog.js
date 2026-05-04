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
  } = req.body || {};

  if (!log_date || !raw_notes?.trim()) {
    return res.status(400).json({ error: "log_date and raw_notes are required" });
  }

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
${priorLogsBlock}

Instructions:
- Write in professional construction daily log format
- Weave in all quick check details naturally
- Reference prior logs where relevant (continuity, delays, milestones)
- If the same issue appears in 3 or more prior logs, add a "Recurring Note:" line flagging it
- Keep it factual, clear, and professional
- Do not invent details not provided
- Output ONLY the log text — no preamble, no markdown headers, no explanation`;

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

    const generated_log = data.content?.find((b) => b.type === "text")?.text?.trim() || "";
    if (!generated_log) {
      return res.status(500).json({ error: "AI returned an empty log" });
    }

    return res.status(200).json({
      generated_log,
      weather,
      prior_logs_count: priorLogs.length,
    });
  } catch (err) {
    console.error("SmartLog generation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
