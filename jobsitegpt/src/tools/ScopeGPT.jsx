import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { callClaude, downloadTxt } from "../lib/api";
import { useFiles, useToast } from "../lib/hooks";
import { getProjectFileAsBase64, saveGeneration } from "../lib/projects";
import { ProcessingSteps, UploadZone, ProjectFilePicker, SpecialInstructions } from "../components/SharedComponents";
import ProjectSwitcher from "../components/ProjectSwitcher";

const STEPS = [
  "Uploading documents…",
  "Analyzing project scope…",
  "Building trade breakdown…",
  "Finalizing scope document…",
];

// Restore result from sessionStorage on page load (back button support)
function loadSavedResult() {
  try {
    const saved = sessionStorage.getItem("jsg_scope_result");
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

export default function ScopeGPT({ activeProject, onProjectChange }) {
  const navigate = useNavigate();
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("Residential Remodel");
  const [notes, setNotes] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [status, setStatus] = useState(() => loadSavedResult() ? "done" : "idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(loadSavedResult);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();

  // Project file picker state
  const [selectedPF, setSelectedPF] = useState([]); // { id, file_name, file_type, storage_path, b64 }
  const [loadingPF, setLoadingPF] = useState(new Set());

  // Clear saved result when project changes so stale data from a previous project never shows
  useEffect(() => {
    setSelectedPF([]);
    setResult(null);
    setStatus("idle");
    setError("");
    setProjectName("");
    setNotes("");
    setSpecialInstructions("");
    resetFiles();
    sessionStorage.removeItem("jsg_scope_result");
  }, [activeProject?.id]);

  const projName = activeProject?.name || projectName;

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
    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1900));
    try {
      const content = [];

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
        if (f.type.startsWith("image/"))
          content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
        else
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      });

      const projectContext = activeProject
        ? `Project: "${activeProject.name}" | Client: "${activeProject.client_name || "N/A"}" | Address: "${activeProject.address || "N/A"}" | Contract: ${activeProject.contract_type?.replace("_", " ")} | Type: ${projectType}`
        : `Project: "${projName}" | Type: ${projectType}`;

      content.push({
        type: "text",
        text: `${projectContext}\nNotes: ${notes || "None"}\n${specialInstructions ? `Special Instructions: ${specialInstructions}\n` : ""}\nGenerate a complete professional scope of work. Return ONLY valid JSON:\n{"projectName":"string","projectType":"string","projectAddress":"string or null","overview":"string","trades":[{"id":1,"tradeName":"string","contractor":"string","scopeText":"string","lineItems":[{"description":"string","note":"string or null"}]}],"generalConditions":["string"],"exclusions":["string"],"clarifications":["string"],"estimatedDuration":"string","totalLineItemCount":0}`,
      });

      timers.forEach(clearTimeout);
      const r = await callClaude(
        [{ role: "user", content }],
        "You are an expert GC with 20+ years writing professional scopes of work. Be thorough and complete. Return valid JSON only, no markdown, no explanation, no preamble."
      );

      setResult(r);
      setStatus("done");

      // Persist for back-button support
      sessionStorage.setItem("jsg_scope_result", JSON.stringify(r));

      // localStorage history
      const history = JSON.parse(localStorage.getItem("jsg_history") || "[]");
      history.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        projectId: activeProject?.id || null,
        tool: "ScopeGPT",
        title: r.projectName,
        date: new Date().toISOString(),
        summary: r.overview,
      });
      localStorage.setItem("jsg_history", JSON.stringify(history.slice(0, 100)));

      // Supabase history (if project is active)
      if (activeProject?.id) {
        saveGeneration(activeProject.id, "ScopeGPT", r.projectName, r.overview, r);
      }
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e.message);
      setStatus("error");
    }
  };

  const reset = () => {
    resetFiles();
    setProjectName(""); setNotes(""); setSpecialInstructions("");
    setSelectedPF([]); setStatus("idle"); setResult(null); setError("");
    sessionStorage.removeItem("jsg_scope_result");
  };

  const goToSchedule = () => {
    sessionStorage.setItem("jsg_scope_handoff", JSON.stringify(result));
    navigate("/schedule");
  };

  const toText = (r) => {
    const lines = [`SCOPE OF WORK\n=============\nProject: ${r.projectName}\nType: ${r.projectType}\nDuration: ${r.estimatedDuration}\n\nOVERVIEW\n--------\n${r.overview}\n`];
    r.trades.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.tradeName.toUpperCase()} [${t.contractor}]\n   ${t.scopeText}`);
      t.lineItems.forEach((li) => lines.push(`   • ${li.description}${li.note ? ` (${li.note})` : ""}`));
      lines.push("");
    });
    if (r.generalConditions?.length) { lines.push("GENERAL CONDITIONS\n------------------"); r.generalConditions.forEach((g) => lines.push(`• ${g}`)); lines.push(""); }
    if (r.exclusions?.length) { lines.push("EXCLUSIONS\n----------"); r.exclusions.forEach((e) => lines.push(`• ${e}`)); lines.push(""); }
    if (r.clarifications?.length) { lines.push("CLARIFICATIONS\n--------------"); r.clarifications.forEach((c) => lines.push(`• ${c}`)); }
    return lines.join("\n");
  };

  return (
    <div className="fade-up">
      <ProjectSwitcher activeProject={activeProject} onProjectChange={onProjectChange} />

      {(status === "idle" || status === "error") && (
        <>
          <div className="section-label">Project Details</div>
          <div className="row-2 input-group">
            <div>
              <label className="field-label">Project Name *</label>
              <input
                type="text"
                placeholder="e.g. Johnson Kitchen & Bath Remodel"
                value={activeProject?.name || projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={!!activeProject?.name}
              />
            </div>
            <div>
              <label className="field-label">Project Type</label>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                {["Residential Remodel","New Construction","Commercial TI","Addition","Exterior / Roofing","Multi-Family","Light Industrial"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="section-label">Plans & Documents</div>
          {activeProject?.id && (
            <ProjectFilePicker
              projectId={activeProject.id}
              selectedIds={selectedPF.map((f) => f.id)}
              loadingIds={loadingPF}
              onToggle={toggleProjectFile}
            />
          )}
          <div className="input-group">
            <UploadZone files={files} onAdd={add} onRemove={remove} hint="PDF plans, permit sets, photos · drag or click" />
          </div>

          <div className="section-label">Project Description</div>
          <div className="input-group">
            <label className="field-label">Describe the Scope</label>
            <textarea
              placeholder="e.g. Full kitchen gut to studs — new layout with island. Primary bath: demo tile, new walk-in shower, double vanity, luxury finishes throughout…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <SpecialInstructions value={specialInstructions} onChange={setSpecialInstructions} />

          {error && <div className="error-box">⚠ {error}</div>}
          <button className="btn btn-primary btn-lg" disabled={!projName.trim()} onClick={generate}>
            ⚡ Generate Scope of Work
          </button>
        </>
      )}

      {status === "loading" && <ProcessingSteps steps={STEPS} idx={stepIdx} />}

      {status === "done" && result && (
        <>
          <div className="result-header-card">
            <div className="result-title">{result.projectName}</div>
            <div className="result-meta">
              {result.projectType}{result.projectAddress ? ` · ${result.projectAddress}` : ""} · {result.estimatedDuration} · {result.totalLineItemCount} line items / {result.trades.length} trades
            </div>
            <div className="result-actions">
              <button className="btn btn-primary" onClick={() => downloadTxt(`${result.projectName.replace(/\s+/g, "_")}_Scope.txt`, toText(result))}>⬇ Download</button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(toText(result)); showToast("Copied!"); }}>⧉ Copy</button>
              <button className="btn btn-ghost" onClick={reset}>↩ New Scope</button>
            </div>
          </div>

          {/* Schedule handoff — direct navigation, no JSON export required */}
          <div className="handoff-banner">
            <div style={{ fontSize: 22 }}>📅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: "#4a90e2", marginBottom: 3 }}>Ready to build the Gantt chart?</div>
              <div style={{ fontSize: 12, color: "#606880" }}>Scope data passes automatically — no download needed.</div>
            </div>
            <button
              className="btn"
              style={{ borderColor: "rgba(74,144,226,0.3)", color: "#4a90e2" }}
              onClick={goToSchedule}
            >
              Open ScheduleGPT →
            </button>
          </div>

          <div className="section-label">Scope by Trade</div>
          {result.trades.map((t) => (
            <div key={t.id} className="trade-block">
              <div className="trade-header">
                <span className="trade-num">#{String(t.id).padStart(2, "0")}</span>
                <span className="trade-name">{t.tradeName}</span>
                <span className="trade-badge">{t.contractor}</span>
              </div>
              <div className="trade-body">
                <div className="scope-text">{t.scopeText}</div>
                <div className="line-items">
                  {t.lineItems.map((li, i) => (
                    <div key={i} className="line-item">
                      <span className="line-bullet">▸</span>
                      <div>
                        <div>{li.description}</div>
                        {li.note && <div className="line-note">{li.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {result.generalConditions?.length > 0 && (
            <><div className="section-label" style={{ marginTop: 22 }}>General Conditions</div>
            <div className="notes-block"><div className="notes-list">{result.generalConditions.map((g, i) => <div key={i} className="notes-item">{g}</div>)}</div></div></>
          )}
          {result.exclusions?.length > 0 && (
            <><div className="section-label">Exclusions</div>
            <div className="notes-block"><div className="notes-list">{result.exclusions.map((e, i) => <div key={i} className="notes-item">{e}</div>)}</div></div></>
          )}
          {result.clarifications?.length > 0 && (
            <><div className="section-label">Clarifications</div>
            <div className="notes-block"><div className="notes-list">{result.clarifications.map((c, i) => <div key={i} className="notes-item">{c}</div>)}</div></div></>
          )}

          <div className="result-actions" style={{ marginTop: 24 }}>
            <button className="btn btn-primary" onClick={() => downloadTxt(`${result.projectName.replace(/\s+/g, "_")}_Scope.txt`, toText(result))}>⬇ Download Scope</button>
            <button className="btn" style={{ borderColor: "rgba(74,144,226,0.3)", color: "#4a90e2" }} onClick={goToSchedule}>📅 Open in ScheduleGPT</button>
            <button className="btn btn-ghost" onClick={reset}>↩ Start Over</button>
          </div>
        </>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
