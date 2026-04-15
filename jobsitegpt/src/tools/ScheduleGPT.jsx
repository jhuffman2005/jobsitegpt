import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { callClaude, downloadTxt } from "../lib/api";
import { useFiles, useToast } from "../lib/hooks";
import { getProjectFileAsBase64, saveGeneration, getGenerationById } from "../lib/projects";
import { ProcessingSteps, UploadZone, ProjectFilePicker, SpecialInstructions } from "../components/SharedComponents";
import ProjectSwitcher from "../components/ProjectSwitcher";

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

// Load scope handoff from ScopeGPT if present
function loadScopeHandoff() {
  try {
    const raw = sessionStorage.getItem("jsg_scope_handoff");
    if (!raw) return null;
    sessionStorage.removeItem("jsg_scope_handoff"); // consume once
    return JSON.parse(raw);
  } catch { return null; }
}

export default function ScheduleGPT({ activeProject, onProjectChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const historyId = searchParams.get("historyId");
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("remodel");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();
  const [scopeHandoff, setScopeHandoff] = useState(null); // scope data passed from ScopeGPT

  // Project file picker state
  const [selectedPF, setSelectedPF] = useState([]);
  const [loadingPF, setLoadingPF] = useState(new Set());

  // Check for scope handoff on mount
  useEffect(() => {
    const handoff = loadScopeHandoff();
    if (handoff) {
      setScopeHandoff(handoff);
      showToast("Scope data loaded from ScopeGPT");
    }
  }, []);

  // Clear project file selection when project changes
  useEffect(() => {
    setSelectedPF([]);
  }, [activeProject?.id]);

  // Hydrate from a saved generation when navigated here with ?historyId=
  useEffect(() => {
    if (!historyId) return;
    let cancelled = false;
    (async () => {
      const g = await getGenerationById(historyId);
      if (cancelled) return;
      if (g?.result_data) {
        setResult(g.result_data);
        setStatus("done");
        setError("");
      }
    })();
    return () => { cancelled = true; };
  }, [historyId]);

  const projName = activeProject?.name || projectName || scopeHandoff?.projectName || "";

  const toggleProjectFile = async (file) => {
    const exists = selectedPF.find((f) => f.id === file.id);
    if (exists) {
      setSelectedPF((p) => p.filter((f) => f.id !== file.id));
      return;
    }
    setLoadingPF((prev) => new Set([...prev, file.id]));
    try {
      const base64 = await getProjectFileAsBase64(file.storage_path);
      setSelectedPF((p) => [...p, { ...file, b64: base64 }]);
    } catch (e) {
      showToast("Could not load file: " + e.message);
    } finally {
      setLoadingPF((prev) => { const s = new Set(prev); s.delete(file.id); return s; });
    }
  };

  const generate = async () => {
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1800));
    try {
      const content = [];

      // Scope handoff from ScopeGPT (highest priority context)
      if (scopeHandoff) {
        content.push({ type: "text", text: `ScopeGPT Output (use this as the authoritative scope):\n${JSON.stringify(scopeHandoff)}` });
      }

      // Project files selected from repository
      selectedPF.forEach((pf) => {
        if (!pf.b64) return;
        if (pf.file_type?.startsWith("image/"))
          content.push({ type: "image", source: { type: "base64", media_type: pf.file_type, data: pf.b64 } });
        else
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pf.b64 } });
      });

      // Locally uploaded files
      files.forEach((f) => {
        const data = b64[f.name];
        if (!data) return;
        if (f.type.startsWith("image/")) {
          content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
        } else if (f.type === "application/json" || f.name.endsWith(".json")) {
          const decoded = atob(data);
          content.push({ type: "text", text: `ScopeGPT Export:\n${decoded}` });
        } else {
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
        }
      });

      const projectContext = activeProject
        ? `Project: "${activeProject.name}" | Client: "${activeProject.client_name || "N/A"}" | Address: "${activeProject.address || "N/A"}" | Type: ${projectType === "remodel" ? "Remodel/Renovation" : "New Construction"}`
        : `Project: "${projName}" | Type: ${projectType === "remodel" ? "Remodel/Renovation" : "New Construction"}`;

      content.push({
        type: "text",
        text: `${projectContext}\n${specialInstructions ? `Special Instructions: ${specialInstructions}\n` : ""}\nAnalyze and return ONLY valid JSON:\n{"projectName":"string","totalDays":0,"phases":["Phase1"],"tasks":[{"id":1,"task":"string","phase":"string","startDay":1,"durationDays":5,"dependencies":[],"trade":"string","notes":"string"}],"subcontractors":[{"trade":"string","phase":"string","estimatedDays":0,"recommendedSubTypes":["string"],"scope":"string"}]}\n\nA full renovation: 15-30 tasks across multiple phases. Keep task names under 50 chars, notes under 60 chars, recommendedSubTypes 2-3 items max.`,
      });

      timers.forEach(clearTimeout);
      const r = await callClaude(
        [{ role: "user", content }],
        `You are an expert construction scheduler. ${projectType === "remodel" ? "Focus on interior trades; only include exterior if documents explicitly call for them." : "Include full sequence: site work, excavation, foundation, framing, exterior, MEP, finishes."} Return valid JSON only, no markdown.`
      );

      setResult(r);
      setStatus("done");

      // localStorage history
      const history = JSON.parse(localStorage.getItem("jsg_history") || "[]");
      history.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        projectId: activeProject?.id || null,
        tool: "ScheduleGPT",
        title: r.projectName,
        date: new Date().toISOString(),
        summary: `${r.tasks.length} tasks across ${r.phases.length} phases · ${r.totalDays} days`,
      });
      localStorage.setItem("jsg_history", JSON.stringify(history.slice(0, 100)));

      // Supabase history
      if (activeProject?.id) {
        saveGeneration(
          activeProject.id, "ScheduleGPT", r.projectName,
          `${r.tasks.length} tasks · ${r.phases.length} phases · ${r.totalDays} days`,
          r
        );
      }
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e.message);
      setStatus("error");
    }
  };

  const reset = () => {
    resetFiles();
    setProjectName(""); setSpecialInstructions("");
    setSelectedPF([]); setScopeHandoff(null);
    setStatus("idle"); setResult(null); setError("");
    if (historyId) {
      const p = new URLSearchParams(searchParams);
      p.delete("historyId");
      setSearchParams(p, { replace: true });
    }
  };

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
      <ProjectSwitcher activeProject={activeProject} onProjectChange={onProjectChange} />

      {(status === "idle" || status === "error") && (
        <>
          {/* Scope handoff banner */}
          {scopeHandoff && (
            <div style={{ background: "rgba(74,144,226,0.06)", border: "1px solid rgba(74,144,226,0.2)", padding: "12px 16px", marginBottom: 20, borderRadius: 6, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: "#4a90e2" }}>Scope loaded from ScopeGPT</div>
                <div style={{ fontSize: 12, color: "#606880" }}>{scopeHandoff.projectName} · {scopeHandoff.trades?.length} trades · {scopeHandoff.estimatedDuration}</div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setScopeHandoff(null)}>✕ Clear</button>
            </div>
          )}

          <div className="section-label">Project Info</div>
          <div className="row-2 input-group">
            <div>
              <label className="field-label">Project Name</label>
              <input
                type="text"
                placeholder="e.g. Riverside Townhomes Phase 2"
                value={activeProject?.name || projectName || scopeHandoff?.projectName || ""}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={!!(activeProject?.name || scopeHandoff?.projectName)}
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
          {activeProject?.id && (
            <ProjectFilePicker
              projectId={activeProject.id}
              selectedIds={selectedPF.map((f) => f.id)}
              loadingIds={loadingPF}
              onToggle={toggleProjectFile}
            />
          )}
          <div className="input-group">
            <UploadZone files={files} onAdd={add} onRemove={remove} hint="Scope of work, bid, plans, or ScopeGPT JSON export · PDF · Images" />
          </div>

          <SpecialInstructions value={specialInstructions} onChange={setSpecialInstructions} />

          {error && <div className="error-box">⚠ {error}</div>}
          <button
            className="btn btn-primary btn-lg"
            disabled={!scopeHandoff && files.length === 0 && selectedPF.length === 0 && !projName.trim()}
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
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#c0c8d8" }}>{t.id}</td>
                      <td style={{ fontWeight: 600 }}>{t.task}</td>
                      <td><span className="phase-pill" style={{ background: pc.bg, color: pc.color }}>{t.phase}</span></td>
                      <td style={{ color: "#606880" }}>{t.trade}</td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11 }}>Day {t.startDay}</td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11 }}>{t.durationDays}d</td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#c0c8d8" }}>{t.dependencies.length ? t.dependencies.join(", ") : "—"}</td>
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
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11 }}>{s.estimatedDays}d</td>
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
