// One-off trigger page for the scope/schedule structured-data migration.
// Lives at /migrate. After Step 5 verification this route and file can be
// deleted in a cleanup commit; the endpoint at /api/migrate-projects.js can
// stay (idempotent skip means re-running is safe).

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MigrateProjects() {
  const [running, setRunning] = useState(false);
  const [force, setForce] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const run = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const url = force ? "/api/migrate-projects?force=true" : "/api/migrate-projects";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fade-up" style={{ maxWidth: 720 }}>
      <div className="section-label">Data Model Migration</div>
      <div style={{ fontSize: 13, color: "#606880", marginBottom: 16, lineHeight: 1.6 }}>
        Promotes each project's newest ScopeGPT and ScheduleGPT generation into the new
        structured columns (<code>scope_trades</code>, <code>scope_notes</code>,
        <code>schedule_tasks</code>, <code>schedule_phases</code>, <code>schedule_subcontractors</code>).
        Idempotent — projects already migrated are skipped unless you tick Force.
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
          disabled={running}
        />
        <span style={{ fontSize: 13, color: "#1a1f2e" }}>
          Force re-migrate (overwrites projects that already have structured data)
        </span>
      </label>

      <button className="btn btn-primary btn-lg" onClick={run} disabled={running}>
        {running ? "Running migration…" : "Run Migration"}
      </button>

      {error && (
        <div className="error-box" style={{ marginTop: 18 }}>⚠ {error}</div>
      )}

      {result && (
        <div style={{ marginTop: 22, padding: 18, background: "#f8f9fc", border: "1px solid #e0e4ef", borderRadius: 8 }}>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: "#1a1f2e", marginBottom: 12 }}>
            Migration Summary
          </div>
          <SummaryRows summary={result} />
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "#606880" }}>Raw JSON</summary>
            <pre style={{ fontSize: 11, lineHeight: 1.5, background: "#ffffff", border: "1px solid #e0e4ef", padding: 12, borderRadius: 6, overflow: "auto", marginTop: 8 }}>
{JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function SummaryRows({ summary }) {
  const rows = [
    ["Projects scanned",            summary.projects_total],
    ["Scope migrated",              summary.scope_migrated],
    ["Scope skipped (already done)", summary.scope_skipped_already_done],
    ["Scope skipped (no generation)", summary.scope_skipped_no_generation],
    ["Schedule migrated",           summary.schedule_migrated],
    ["Schedule skipped (already done)", summary.schedule_skipped_already_done],
    ["Schedule skipped (no generation)", summary.schedule_skipped_no_generation],
    ["Scope trades created",        summary.scope_trades_migrated],
    ["Scope items created",         summary.scope_items_migrated],
    ["Schedule tasks created",      summary.schedule_tasks_migrated],
    ["Schedule tasks approximated", summary.schedule_tasks_approximated],
    ["Errors",                      summary.errors?.length || 0],
  ];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <tbody>
        {rows.map(([label, val]) => (
          <tr key={label}>
            <td style={{ padding: "6px 0", color: "#606880", borderBottom: "1px solid #eef1f6" }}>{label}</td>
            <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "#1a1f2e", borderBottom: "1px solid #eef1f6" }}>{val}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
