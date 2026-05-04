import { createClient } from "@supabase/supabase-js";

// Vercel cron handler. Runs Friday afternoon, finds every project with
// smartlog_auto_send=true that has logs from the past 7 days, asks Claude to
// compress them into a single executive summary, and emails the client via
// Resend.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

function weekRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { startISO: iso(start), endISO: iso(end) };
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short", day: "numeric",
  });
}

async function generateSummary({ projectName, weekStart, weekEnd, logs }) {
  const logBlock = logs
    .map((l) => `--- ${l.log_date}${l.weather ? ` · ${l.weather}` : ""} ---\n${l.generated_log || ""}`)
    .join("\n\n");

  const prompt = `Project: ${projectName}
Week: ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}

Daily logs from this week:
${logBlock}

Instructions:
- Write a single executive weekly update for the client
- Open with what got done this week (progress, milestones)
- Note any delays, issues, or open items the client should know about
- Mention deliveries, inspections, and safety items if relevant
- Close with what's planned for next week (only if the logs hint at it)
- Keep it 200–350 words, factual, professional, no padding
- Output ONLY the summary text — no preamble, no markdown headers`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: "You are a construction project manager writing concise weekly client updates.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "AI failed");
  return data.content?.find((b) => b.type === "text")?.text?.trim() || "";
}

function buildEmailHtml({ projectName, weekStart, weekEnd, summary, logs }) {
  const escape = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const dayList = logs
    .map((l) => `<li style="font-size: 12px; color: #606880; margin-bottom: 4px;">${escape(fmtDate(l.log_date))}${l.weather ? ` — <span style="color: #909ab0;">${escape(l.weather)}</span>` : ""}</li>`)
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1f2e; padding: 20px; border-radius: 8px 8px 0 0;">
        <div style="color: #f0a500; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px;">Weekly Update</div>
        <div style="color: #ffffff; font-size: 22px; font-weight: bold;">${escape(projectName)}</div>
        <div style="color: #909ab0; font-size: 13px; margin-top: 4px;">
          Week of ${escape(fmtDate(weekStart))} – ${escape(fmtDate(weekEnd))}
        </div>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e0e4ef;">
        <div style="font-size: 14px; color: #1a1f2e; line-height: 1.7; white-space: pre-wrap;">${escape(summary)}</div>
        ${logs.length ? `
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e4ef;">
            <div style="font-size: 11px; color: #909ab0; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">Days Logged</div>
            <ul style="margin: 0; padding-left: 18px;">${dayList}</ul>
          </div>
        ` : ""}
      </div>
      <div style="background: #f0f2f5; padding: 14px 20px; border-radius: 0 0 8px 8px; text-align: center;">
        <div style="font-size: 12px; color: #909ab0;">Sent via JobSiteGPT · SmartLog</div>
      </div>
    </div>
  `;
}

async function sendEmail({ to, subject, html, fromName }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: `${fromName || "JobSiteGPT"} <onboarding@resend.dev>`,
      to: [to],
      subject,
      html,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Email failed");
  return data.id;
}

export default async function handler(req, res) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Allow GET (cron) or
  // POST (manual trigger). Reject if a CRON_SECRET is set and doesn't match.
  if (CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !ANTHROPIC_KEY || !RESEND_KEY) {
    return res.status(500).json({ error: "Server configuration error — missing env vars" });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { startISO, endISO } = weekRange();
  const results = { ok: [], skipped: [], failed: [] };

  try {
    const { data: projects, error: projErr } = await supabase
      .from("projects")
      .select("id, name, user_id, client_email, smartlog_client_email, smartlog_auto_send")
      .eq("smartlog_auto_send", true);
    if (projErr) throw projErr;

    for (const project of projects || []) {
      const recipient = project.smartlog_client_email || project.client_email;
      if (!recipient) {
        results.skipped.push({ project: project.name, reason: "no client email" });
        continue;
      }

      const { data: logs } = await supabase
        .from("smart_logs")
        .select("log_date, weather, generated_log")
        .eq("project_id", project.id)
        .gte("log_date", startISO)
        .lte("log_date", endISO)
        .order("log_date", { ascending: true });

      if (!logs?.length) {
        results.skipped.push({ project: project.name, reason: "no logs this week" });
        continue;
      }

      try {
        const summary = await generateSummary({
          projectName: project.name,
          weekStart: startISO,
          weekEnd: endISO,
          logs,
        });
        if (!summary) throw new Error("AI returned empty summary");

        // Try to pull the GC's company name from their auth metadata for the
        // From line. Falls back to JobSiteGPT.
        let fromName = "JobSiteGPT";
        try {
          const { data: userData } = await supabase.auth.admin.getUserById(project.user_id);
          if (userData?.user?.user_metadata?.company_name) {
            fromName = userData.user.user_metadata.company_name;
          }
        } catch {}

        await sendEmail({
          to: recipient,
          subject: `Weekly Update — ${project.name} — Week of ${fmtDate(startISO)}`,
          html: buildEmailHtml({
            projectName: project.name,
            weekStart: startISO,
            weekEnd: endISO,
            summary,
            logs,
          }),
          fromName,
        });
        results.ok.push({ project: project.name, log_count: logs.length });
      } catch (e) {
        console.error(`Weekly summary failed for ${project.name}:`, e.message);
        results.failed.push({ project: project.name, error: e.message });
      }
    }

    return res.status(200).json({
      week: { start: startISO, end: endISO },
      ...results,
    });
  } catch (err) {
    console.error("Weekly summary cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
