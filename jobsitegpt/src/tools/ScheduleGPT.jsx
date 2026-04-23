import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { callClaude, downloadTxt } from "../lib/api";
import { useFiles, useToast } from "../lib/hooks";
import { getProjectFileAsBase64, saveGeneration, updateGeneration, getGenerationById, getUserSettings } from "../lib/projects";
import { ProcessingSteps, UploadZone, ProjectFilePicker, SpecialInstructions } from "../components/SharedComponents";
import ProjectSwitcher from "../components/ProjectSwitcher";
import SendToClientModal from "../components/SendToClientModal";

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

function parseLogoDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const ext = (mime.split("/")[1] || "png").split("+")[0];
  return { mime, base64: m[2], filename: `logo.${ext}` };
}

// Forward pass: push any task that starts before its dependencies finish.
// Leaves a task alone if it already starts on/after all of its predecessors
// (so a user can still set an intentional buffer). Safe against missing or
// circular dependencies via an iteration cap.
function cascadeSchedule(tasks) {
  const next = tasks.map((t) => ({
    ...t,
    startDay: Math.max(1, Number(t.startDay) || 1),
    durationDays: Math.max(1, Number(t.durationDays) || 1),
    dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
  }));
  const byId = new Map(next.map((t) => [String(t.id), t]));
  const maxIter = next.length + 2;
  for (let i = 0; i < maxIter; i++) {
    let changed = false;
    for (const t of next) {
      let earliest = 1;
      for (const dep of t.dependencies) {
        const d = byId.get(String(dep));
        if (!d) continue;
        const finish = d.startDay + d.durationDays; // next free day after dep
        if (finish > earliest) earliest = finish;
      }
      if (t.startDay < earliest) {
        t.startDay = earliest;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}

function computeTotalDays(tasks) {
  return tasks.reduce((max, t) => {
    const finish = (Number(t.startDay) || 1) + (Number(t.durationDays) || 0) - 1;
    return Math.max(max, finish);
  }, 0);
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
  const [sendOpen, setSendOpen] = useState(false);
  const [generationId, setGenerationId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
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
        setGenerationId(g.id);
        setDirty(false);
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
      setGenerationId(null);
      setDirty(false);
      if (activeProject?.id) {
        saveGeneration(
          activeProject.id, "ScheduleGPT", r.projectName,
          `${r.tasks.length} tasks · ${r.phases.length} phases · ${r.totalDays} days`,
          r
        ).then((row) => {
          if (row?.id) setGenerationId(row.id);
        });
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
    setGenerationId(null); setDirty(false);
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
    result.tasks.forEach((t) => lines.push([t.id, t.task, t.phase, t.trade, `Day ${t.startDay}`, `${t.durationDays}d`, (t.dependencies || []).join(",") || "—", t.notes || ""].join("\t")));
    lines.push(`\nSUBCONTRACTOR WORKSHEET`);
    lines.push(["Trade","Phase","Est. Days","Sub Types","Scope"].join("\t"));
    result.subcontractors.forEach((s) => lines.push([s.trade, s.phase, s.estimatedDays, (s.recommendedSubTypes || []).join(", "), s.scope].join("\t")));
    downloadTxt(`${result.projectName.replace(/\s+/g, "_")}_Gantt.tsv`, lines.join("\n"));
    showToast("Downloaded!");
  };

  const updateResult = (updater) => {
    setResult((prev) => prev ? updater(prev) : prev);
    setDirty(true);
  };

  const saveChanges = async () => {
    if (!result) return;
    if (!generationId) {
      showToast("No saved schedule to update — select or generate one under a project");
      return;
    }
    setSaving(true);
    try {
      await updateGeneration(generationId, {
        title: result.projectName,
        summary: `${result.tasks.length} tasks · ${result.phases.length} phases · ${result.totalDays} days`,
        result_data: result,
      });
      setDirty(false);
      showToast("Changes saved!");
    } catch (e) {
      showToast("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Auto-save edits back to Supabase so navigating away via history links
  // shows the edited version. Debounced to avoid a request per keystroke.
  useEffect(() => {
    if (!dirty || !generationId || !result) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await updateGeneration(generationId, {
          title: result.projectName,
          summary: `${result.tasks.length} tasks · ${result.phases.length} phases · ${result.totalDays} days`,
          result_data: result,
        });
        setDirty(false);
      } catch (e) {
        console.warn("Auto-save failed:", e.message);
      } finally {
        setSaving(false);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, generationId, result]);
  // Whenever tasks change, cascade dependency starts forward and recompute totalDays.
  const applyTaskChange = (r, nextTasks) => {
    const cascaded = cascadeSchedule(nextTasks);
    return { ...r, tasks: cascaded, totalDays: computeTotalDays(cascaded) };
  };

  const updateTask = (idx, field, value) =>
    updateResult((r) => applyTaskChange(r, r.tasks.map((t, i) => i === idx ? { ...t, [field]: value } : t)));
  const deleteTask = (idx) =>
    updateResult((r) => {
      const removedId = r.tasks[idx]?.id;
      const filtered = r.tasks
        .filter((_, i) => i !== idx)
        .map((t) => removedId != null
          ? { ...t, dependencies: (t.dependencies || []).filter((d) => String(d) !== String(removedId)) }
          : t);
      return applyTaskChange(r, filtered);
    });
  const addTask = () => {
    updateResult((r) => {
      const nextId = (r.tasks.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) || 0) + 1;
      const defaultPhase = r.phases?.[0] || "";
      const nextTasks = [...r.tasks, { id: nextId, task: "", phase: defaultPhase, startDay: 1, durationDays: 1, dependencies: [], trade: "", notes: "" }];
      return applyTaskChange(r, nextTasks);
    });
  };
  const updateSub = (idx, field, value) =>
    updateResult((r) => ({ ...r, subcontractors: r.subcontractors.map((s, i) => i === idx ? { ...s, [field]: value } : s) }));
  const deleteSub = (idx) =>
    updateResult((r) => ({ ...r, subcontractors: r.subcontractors.filter((_, i) => i !== idx) }));
  const addSub = () => {
    updateResult((r) => ({
      ...r,
      subcontractors: [...(r.subcontractors || []), { trade: "", phase: r.phases?.[0] || "", estimatedDays: 0, recommendedSubTypes: [], scope: "" }],
    }));
  };

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const toEmailHtml = (r, clientName, branding = {}) => {
    const { hasLogo, logoCid, companyName } = branding;
    const taskRows = r.tasks.map((t) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:11px;color:#909ab0;">${esc(t.id)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:13px;font-weight:600;">${esc(t.task)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#606880;">${esc(t.phase)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#606880;">${esc(t.trade)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;">Day ${esc(t.startDay)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;">${esc(t.durationDays)}d</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:11px;color:#909ab0;">${esc((t.dependencies || []).join(", ") || "—")}</td>
      </tr>`).join("");

    const subRows = (r.subcontractors || []).map((s) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:13px;font-weight:600;">${esc(s.trade)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#606880;">${esc(s.phase)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;">${esc(s.estimatedDays)}d</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:11px;color:#606880;">${esc((s.recommendedSubTypes || []).join(", "))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#606880;">${esc(s.scope)}</td>
      </tr>`).join("");

    const thStyle = "background:#f5f7fa;padding:8px 10px;text-align:left;font-family:Inter,sans-serif;font-size:10px;letter-spacing:0.1em;color:#909ab0;text-transform:uppercase;border-bottom:1.5px solid #e0e4ef;";

    const brandingHeader = (hasLogo || companyName)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:18px;"><tr>
           ${hasLogo ? `<td style="padding:0 14px 18px 0;border-bottom:1px solid #f0f2f5;vertical-align:middle;width:1%;white-space:nowrap;"><img src="cid:${logoCid}" alt="${esc(companyName || "Company")}" style="display:block;max-height:60px;max-width:180px;object-fit:contain;border:0;outline:none;" /></td>` : ""}
           ${companyName ? `<td style="padding:0 0 18px;border-bottom:1px solid #f0f2f5;vertical-align:middle;font-weight:700;font-size:15px;letter-spacing:0.04em;color:#1a1f2e;">${esc(companyName)}</td>` : ""}
         </tr></table>`
      : "";
    const footerSender = companyName ? esc(companyName) : "JobSiteGPT";

    return `<!doctype html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#1a1f2e;">
      <div style="max-width:780px;margin:0 auto;padding:24px;">
        <div style="background:#ffffff;border:1px solid #e0e4ef;border-top:3px solid #f0a500;border-radius:8px;padding:28px 30px;">
          ${brandingHeader}
          <div style="font-size:11px;letter-spacing:0.12em;color:#909ab0;text-transform:uppercase;margin-bottom:8px;">Project Schedule</div>
          <h1 style="font-size:24px;margin:0 0 6px;color:#1a1f2e;letter-spacing:0.02em;">${esc(r.projectName)}</h1>
          <div style="font-size:12px;color:#909ab0;">${esc(r.totalDays)} days · ${r.tasks.length} tasks · ${r.phases.length} phases</div>
          ${clientName ? `<p style="font-size:14px;color:#1a1f2e;margin:22px 0 0;">Hi ${esc(clientName)},</p>
          <p style="font-size:14px;color:#1a1f2e;line-height:1.6;margin:8px 0 0;">Here is the proposed construction schedule for your project. Let me know if you have any questions.</p>` : ""}
          <h3 style="font-size:12px;letter-spacing:0.12em;color:#909ab0;text-transform:uppercase;margin:24px 0 10px;">Task Schedule</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e0e4ef;border-radius:6px;overflow:hidden;">
            <thead><tr><th style="${thStyle}">#</th><th style="${thStyle}">Task</th><th style="${thStyle}">Phase</th><th style="${thStyle}">Trade</th><th style="${thStyle}">Start</th><th style="${thStyle}">Days</th><th style="${thStyle}">Deps</th></tr></thead>
            <tbody>${taskRows}</tbody>
          </table>
          ${subRows ? `<h3 style="font-size:12px;letter-spacing:0.12em;color:#909ab0;text-transform:uppercase;margin:26px 0 10px;">Subcontractor Worksheet</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e0e4ef;border-radius:6px;overflow:hidden;">
            <thead><tr><th style="${thStyle}">Trade</th><th style="${thStyle}">Phase</th><th style="${thStyle}">Est. Days</th><th style="${thStyle}">Sub Types</th><th style="${thStyle}">Scope</th></tr></thead>
            <tbody>${subRows}</tbody>
          </table>` : ""}
          <div style="margin-top:28px;padding-top:16px;border-top:1px solid #f0f2f5;font-size:11px;color:#909ab0;">Sent by ${footerSender} via JobSiteGPT</div>
        </div>
      </div>
    </body></html>`;
  };

  const sendToClient = async ({ clientName, clientEmail }) => {
    let companyName = "";
    let logoDataUrl = "";
    try {
      const settings = await getUserSettings();
      companyName = settings?.company_name || "";
      logoDataUrl = settings?.company_logo || "";
    } catch {}

    const attachments = [];
    let hasLogo = false;
    const logoCid = "company-logo";
    const parsed = parseLogoDataUrl(logoDataUrl);
    if (parsed) {
      attachments.push({
        filename: parsed.filename,
        content: parsed.base64,
        content_id: logoCid,
        content_type: parsed.mime,
        disposition: "inline",
      });
      hasLogo = true;
    }

    const fromName = companyName || "JobSiteGPT";
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: clientEmail,
        subject: `Project Schedule — ${result.projectName}`,
        html: toEmailHtml(result, clientName, { hasLogo, logoCid, companyName }),
        from_name: fromName,
        attachments,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Email failed");
    setSendOpen(false);
    showToast("Schedule sent to client!");
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
            {generationId && (
              <button
                className="btn"
                style={{ borderColor: dirty ? "#f0a500" : "rgba(240,165,0,0.3)", color: dirty ? "#c47f00" : "#909ab0" }}
                disabled={saving || !dirty}
                onClick={saveChanges}
              >
                {saving ? "Saving…" : dirty ? "💾 Save Changes" : "✓ Saved"}
              </button>
            )}
            <button className="btn" style={{ borderColor: "rgba(39,174,96,0.3)", color: "#27ae60" }} onClick={() => setSendOpen(true)}>✉ Send to Client</button>
            <button className="btn btn-ghost" onClick={reset}>↩ New Schedule</button>
          </div>

          <div className="section-label">Schedule Preview</div>
          <div style={{ overflowX: "auto", marginBottom: 24 }}>
            <table className="gantt-table">
              <thead>
                <tr>{["#","Task","Phase","Trade","Start","Days","Deps"].map((h) => <th key={h}>{h}</th>)}<th></th></tr>
              </thead>
              <tbody>
                {result.tasks.map((t, idx) => {
                  const pc = phaseMap[t.phase] || PHASE_COLORS[0];
                  return (
                    <tr key={`${t.id}-${idx}`}>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#c0c8d8", width: 44 }}>{t.id}</td>
                      <td>
                        <input className="edit-input" style={{ fontWeight: 600, fontSize: 12 }}
                          value={t.task}
                          onChange={(e) => updateTask(idx, "task", e.target.value)} />
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <select
                          className="edit-input"
                          style={{ background: pc.bg, color: pc.color, fontSize: 11, padding: "3px 5px", border: "1px solid transparent", borderRadius: 4 }}
                          value={t.phase}
                          onChange={(e) => updateTask(idx, "phase", e.target.value)}
                        >
                          {result.phases.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{ color: "#606880", minWidth: 100 }}>
                        <input className="edit-input" style={{ fontSize: 12, color: "#606880" }}
                          value={t.trade}
                          onChange={(e) => updateTask(idx, "trade", e.target.value)} />
                      </td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, width: 80 }}>
                        <input className="edit-input" style={{ fontSize: 11, width: 60 }} type="number" min="1"
                          value={t.startDay}
                          onChange={(e) => updateTask(idx, "startDay", Number(e.target.value) || 1)} />
                      </td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, width: 70 }}>
                        <input className="edit-input" style={{ fontSize: 11, width: 50 }} type="number" min="1"
                          value={t.durationDays}
                          onChange={(e) => updateTask(idx, "durationDays", Number(e.target.value) || 1)} />
                      </td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#c0c8d8", minWidth: 90 }}>
                        <input className="edit-input" style={{ fontSize: 10, color: "#606880" }}
                          value={(t.dependencies || []).join(", ")}
                          onChange={(e) => updateTask(idx, "dependencies", e.target.value.split(",").map((s) => s.trim()).filter(Boolean).map((v) => Number(v) || v))}
                          placeholder="e.g. 1, 2" />
                      </td>
                      <td className="row-delete-cell">
                        <button
                          type="button"
                          className="delete-icon-btn"
                          title="Delete task"
                          onClick={() => deleteTask(idx)}
                        >🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button type="button" className="add-line-btn" onClick={addTask}>＋ Add Task</button>
          </div>

          <div className="section-label">Subcontractor Worksheet</div>
          <div style={{ overflowX: "auto" }}>
            <table className="sub-table">
              <thead>
                <tr>{["Trade","Phase","Est. Days","Sub Types","Scope"].map((h) => <th key={h}>{h}</th>)}<th></th></tr>
              </thead>
              <tbody>
                {result.subcontractors.map((s, i) => {
                  const pc = phaseMap[s.phase] || PHASE_COLORS[0];
                  return (
                    <tr key={i}>
                      <td style={{ minWidth: 120 }}>
                        <input className="edit-input" style={{ fontWeight: 600, fontSize: 12 }}
                          value={s.trade}
                          onChange={(e) => updateSub(i, "trade", e.target.value)} />
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <select
                          className="edit-input"
                          style={{ background: pc.bg, color: pc.color, fontSize: 11, padding: "3px 5px", border: "1px solid transparent", borderRadius: 4 }}
                          value={s.phase}
                          onChange={(e) => updateSub(i, "phase", e.target.value)}
                        >
                          {result.phases.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, width: 90 }}>
                        <input className="edit-input" style={{ fontSize: 11, width: 60 }} type="number" min="0"
                          value={s.estimatedDays}
                          onChange={(e) => updateSub(i, "estimatedDays", Number(e.target.value) || 0)} />
                      </td>
                      <td style={{ fontSize: 11, color: "#606880", minWidth: 160 }}>
                        <input className="edit-input" style={{ fontSize: 11, color: "#606880" }}
                          value={(s.recommendedSubTypes || []).join(", ")}
                          onChange={(e) => updateSub(i, "recommendedSubTypes", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
                      </td>
                      <td style={{ fontSize: 11, color: "#606880", minWidth: 180 }}>
                        <input className="edit-input" style={{ fontSize: 11, color: "#606880" }}
                          value={s.scope}
                          onChange={(e) => updateSub(i, "scope", e.target.value)} />
                      </td>
                      <td className="row-delete-cell">
                        <button
                          type="button"
                          className="delete-icon-btn"
                          title="Delete row"
                          onClick={() => deleteSub(i)}
                        >🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button type="button" className="add-line-btn" onClick={addSub}>＋ Add Subcontractor</button>
          </div>
        </>
      )}

      <SendToClientModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        onSend={sendToClient}
        projectName={result?.projectName}
        docType="Schedule"
      />
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
