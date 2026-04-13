import { useState } from "react";
import { callClaude, downloadTxt } from "../lib/api";
import { useFiles, useToast } from "../lib/hooks";
import { ProcessingSteps, UploadZone } from "../components/SharedComponents";

const STEPS = [
  "Uploading documents…",
  "Analyzing scope & phases…",
  "Building schedule & dependencies…",
  "Generating subcontractor worksheet…",
];

const PHASE_COLORS = [
  { bg: "rgba(240,165,0,0.1)",   color: "#c47f00" },
  { bg: "rgba(74,144,226,0.1)",  color: "#4a90e2" },
  { bg: "rgba(39,174,96,0.1)",   color: "#27ae60" },
  { bg: "rgba(139,92,246,0.1)",  color: "#8b5cf6" },
  { bg: "rgba(231,76,60,0.1)",   color: "#e74c3c" },
  { bg: "rgba(16,185,129,0.1)",  color: "#10b981" },
];

export default function ScheduleGPT({ activeProject }) {
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("remodel");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();

  const projName = activeProject?.name || projectName;

  const generate = async () => {
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1800));
    try {
      const content = [];
      files.forEach((f) => {
        const data = b64[f.name];
        if (!data) return;
        if (f.type.startsWith("image/"))
          content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
        else
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      });

      const projectContext = activeProject
        ? `Project: "${activeProject.name}" | Client: "${activeProject.client_name || "N/A"}" | Address: "${activeProject.address || "N/A"}" | Type: ${projectType === "remodel" ? "Remodel/Renovation" : "New Construction"}`
        : `Project: "${projName}" | Type: ${projectType === "remodel" ? "Remodel/Renovation" : "New Construction"}`;

      content.push({
        type: "text",
        text: `${projectContext}\n\nAnalyze and return ONLY valid JSON:\n{"projectName":"string","totalDays":0,"phases":["Phase1"],"tasks":[{"id":1,"task":"string","phase":"string","startDay":1,"durationDays":5,"dependencies":[],"trade":"string","notes":"string"}],"subcontractors":[{"trade":"string","phase":"string","estimatedDays":0,"recommendedSubTypes":["string"],"scope":"string"}]}\n\nA full renovation: 15-30 tasks across multiple phases. Keep task names under 50 chars, notes under 60 chars, recommendedSubTypes 2-3 items max.`,
      });
      timers.forEach(clearTimeout);
      const r = await callClaude(
        [{ role: "user", content }],
        `You are an expert construction scheduler. ${projectType === "remodel" ? "Focus on interior trades; only include exterior if documents explicitly call for them." : "Include full sequence: site work, excavation, foundation, framing, exterior, MEP, finishes."} Return valid JSON only, no markdown.`
      );
      setResult(r); setStatus("done");
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e.message);
      setStatus("error");
    }
  };

  const reset = () => { resetFiles(); setProjectName(""); setStatus("idle"); setResult(null); setError(""); };

  const phaseMap = {};
  if (result) result.phases.forEach((p, i) => { phaseMap[p] = PHASE_COLORS[i % PHASE_COLORS.length]; });

  const exportTSV = () => {
    if (!result) return;
    const lines = [`PROJECT GANTT — ${result.projectName}\n`];
    lines.push("TASK SCHEDULE");
    lines.push(["#","Task","Phase","Trade","Start Day","Duration","Dependencies","Notes"].join("\t"));
    result.tasks.forEach((t) => lines.push([t.id, t.task, t.phase, t.trade, `Day ${t.startDay}`, `${t.durationDays}d`, t.dependencies.join(",") || "—", t.notes || ""].join("\t")));
    lines.push(`\nSUBCONTRACTOR WORKSHEET`);
    lines.push(["Trade","Phase","Est. Days","Sub Types","Scope"].join("\t"));
    result.subcontractors.forEach((s) => lines.push([s.trade, s.phase, s.estimatedDays, s.recommendedSubTypes.join(", "), s.scope].join("\t")));
    downloadTxt(`${result.projectName.replace(/\s+/g, "_")}_Gantt.tsv`, lines.join("\n"));
    showToast("Downloaded!");
  };

  return (
    <div className="fade-up">
      {/* Active project banner */}
      {activeProject && (
        <div style={{ background: "rgba(240,165,0,0.06)", border: "1px solid rgba(240,165,0,0.15)", padding: "12px 16px", marginBottom: 22, borderRadius: 6, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14 }}>📁</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>{activeProject.name}</div>
            <div style={{ fontSize: 12, color: "#909ab0" }}>{[activeProject.client_name, activeProject.address].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      )}

      {(status === "idle" || status === "error") && (
        <>
          <div className="section-label">Project Info</div>
          <div className="row-2 input-group">
            <div>
              <label className="field-label">Project Name</label>
              <input
                type="text"
                placeholder="e.g. Riverside Townhomes Phase 2"
                value={activeProject?.name || projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={!!activeProject?.name}
              />
            </div>
            <div>
              <label className="field-label">Project Type</label>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                <option value="remodel">Remodel / Renovation</option>
                <option value="new">New Construction</option>
              </select>
            </div>
          </div>

          <div className="section-label">Upload Construction Documents</div>
          <div className="input-group">
            <UploadZone files={files} onAdd={add} onRemove={remove} hint="Scope of work, bid, plans, or ScopeGPT JSON export · PDF · Images" />
          </div>

          {error && <div className="error-box">⚠ {error}</div>}
          <button
            className="btn btn-primary btn-lg"
            disabled={files.length === 0 && !projName.trim()}
            onClick={generate}
          >
            📅 Generate Gantt Chart
          </button>
        </>
      )}

      {status === "loading" && <ProcessingSteps steps={STEPS} idx={stepIdx} />}

      {status === "done" && result && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Calendar Days</div>
              <div className="stat-value">{result.totalDays}</div>
              <div className="stat-sub">total duration</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Tasks</div>
              <div className="stat-value">{result.tasks.length}</div>
              <div className="stat-sub">across {result.phases.length} phases</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Trades</div>
              <div className="stat-value">{result.subcontractors.length}</div>
              <div className="stat-sub">subcontractor rows</div>
            </div>
          </div>

          <div className="result-actions" style={{ marginBottom: 22 }}>
            <button className="btn btn-primary" onClick={exportTSV}>⬇ Download Gantt (.TSV)</button>
            <button className="btn btn-ghost" onClick={reset}>↩ New Schedule</button>
          </div>

          <div className="section-label">Schedule Preview</div>
          <div style={{ overflowX: "auto", marginBottom: 24 }}>
            <table className="gantt-table">
              <thead>
                <tr>{["#","Task","Phase","Trade","Start","Days","Deps"].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {result.tasks.map((t) => {
                  const pc = phaseMap[t.phase] || PHASE_COLORS[0];
                  return (
                    <tr key={t.id}>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#c0c8d8" }}>{t.id}</td>
                      <td style={{ fontWeight: 600 }}>{t.task}</td>
                      <td><span className="phase-pill" style={{ background: pc.bg, color: pc.color }}>{t.phase}</span></td>
                      <td style={{ color: "#606880" }}>{t.trade}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>Day {t.startDay}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{t.durationDays}d</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#c0c8d8" }}>{t.dependencies.length ? t.dependencies.join(", ") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="section-label">Subcontractor Worksheet</div>
          <div style={{ overflowX: "auto" }}>
            <table className="sub-table">
              <thead>
                <tr>{["Trade","Phase","Est. Days","Sub Types","Scope"].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {result.subcontractors.map((s, i) => {
                  const pc = phaseMap[s.phase] || PHASE_COLORS[0];
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{s.trade}</td>
                      <td><span className="phase-pill" style={{ background: pc.bg, color: pc.color }}>{s.phase}</span></td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{s.estimatedDays}d</td>
                      <td style={{ fontSize: 11, color: "#606880" }}>{s.recommendedSubTypes.join(", ")}</td>
                      <td style={{ fontSize: 11, color: "#606880" }}>{s.scope}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}