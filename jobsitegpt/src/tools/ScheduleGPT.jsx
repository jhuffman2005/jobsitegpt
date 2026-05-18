import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { callClaude, downloadTxt, checkPayloadSize } from "../lib/api";
import { useFiles, useToast } from "../lib/hooks";
import {
  getProjectFileAsBase64, saveGeneration, getGenerationById,
  getUserSettings,
  getProjectActiveSchedule, saveActiveSchedule, setScheduleLocked,
} from "../lib/projects";
import { loadLogoAttachment } from "../lib/companyLogo";
import {
  ensureStructuredSchedule, flattenStructuredSchedule, buildScheduleOrdinalMaps, makeBlankTask, originClassName,
} from "../lib/structuredData";
import LockToggle from "../components/LockToggle";
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

function loadScopeHandoff() {
  try {
    const raw = sessionStorage.getItem("jsg_scope_handoff");
    if (!raw) return null;
    sessionStorage.removeItem("jsg_scope_handoff");
    return JSON.parse(raw);
  } catch { return null; }
}

// Recompute startDay for any task that has dependencies so it sits exactly
// on the earliest day after its predecessors finish. Tasks without deps keep
// whatever startDay the user typed. Safe against missing or circular edges
// via an iteration cap. Works on UUID-keyed tasks (structured shape).
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
      if (t.dependencies.length === 0) continue;
      let earliest = null;
      for (const dep of t.dependencies) {
        const d = byId.get(String(dep));
        if (!d) continue;
        const finish = d.startDay + d.durationDays;
        if (earliest === null || finish > earliest) earliest = finish;
      }
      if (earliest !== null && t.startDay !== earliest) {
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

// Order tasks for display: by phase order, then by startDay within a phase,
// then by original array position as a stable final tiebreaker (tasks sharing
// a startDay keep the AI's / insertion order). This is what keeps added and
// edited tasks sitting in the correct chronological slot instead of jumping to
// the top. Tasks whose phase isn't in the phases array sink to the bottom
// (still grouped with each other, still startDay-ordered).
function sortTasksByPhase(tasks, phases) {
  const order = new Map((phases || []).map((p, i) => [p, i]));
  return tasks
    .map((t, i) => ({
      t,
      i,
      p: order.has(t.phase) ? order.get(t.phase) : Number.MAX_SAFE_INTEGER,
      d: Number(t.startDay) || 0,
    }))
    .sort((a, b) => (a.p - b.p) || (a.d - b.d) || (a.i - b.i))
    .map((x) => x.t);
}

// Build a runtime structured result by pulling the active schedule columns
// from the project. Returns null when there's no schedule yet.
async function loadActiveSchedule(projectId) {
  if (!projectId) return null;
  const active = await getProjectActiveSchedule(projectId);
  if (!active?.schedule_tasks) return null;
  return {
    projectName: "",
    totalDays: computeTotalDays(active.schedule_tasks || []),
    schedule_tasks: active.schedule_tasks || [],
    schedule_phases: active.schedule_phases || [],
    schedule_subcontractors: active.schedule_subcontractors || [],
  };
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
  const [scopeHandoff, setScopeHandoff] = useState(null);

  const [selectedPF, setSelectedPF] = useState([]);
  const [loadingPF, setLoadingPF] = useState(new Set());

  // Lock state: mirrors projects.schedule_locked.
  const [locked, setLocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [historyMeta, setHistoryMeta] = useState(null); // { createdAt, projectId }

  const inHistoryMode = !!historyId;

  useEffect(() => {
    const handoff = loadScopeHandoff();
    if (handoff) {
      setScopeHandoff(handoff);
      showToast("Scope data loaded from ScopeGPT");
    }
  }, []);

  // Active-mode load: pull from projects.schedule_* when a project is active
  // and we're not in history mode.
  useEffect(() => {
    if (inHistoryMode) return;
    setSelectedPF([]);
    if (!activeProject?.id) {
      setResult(null);
      setStatus("idle");
      setGenerationId(null);
      setDirty(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // Always pull the lock state from the project record, even when
      // there's no schedule content yet (a fresh project can be pre-locked).
      const raw = await getProjectActiveSchedule(activeProject.id);
      if (cancelled) return;
      setLocked(!!raw?.schedule_locked);

      const active = await loadActiveSchedule(activeProject.id);
      if (cancelled) return;
      if (active) {
        // Fill projectName from project record since the column doesn't carry it
        active.projectName = activeProject.name || "";
        setResult(active);
        setStatus("done");
        setGenerationId(null);
        setDirty(false);
      } else {
        setResult(null);
        setStatus("idle");
        setGenerationId(null);
        setDirty(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProject?.id, inHistoryMode]);

  // Hydrate from a saved generation when navigated here with ?historyId=.
  useEffect(() => {
    if (!historyId) return;
    let cancelled = false;
    (async () => {
      const g = await getGenerationById(historyId);
      if (cancelled) return;
      if (g?.result_data) {
        const structured = ensureStructuredSchedule(g.result_data);
        setResult(structured);
        setStatus("done");
        setError("");
        setGenerationId(g.id);
        setHistoryMeta({ createdAt: g.created_at, projectId: g.project_id });
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
    const sizeError = checkPayloadSize({ files, projectFiles: selectedPF });
    if (sizeError) {
      setError(sizeError);
      setStatus("error");
      return;
    }
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1800));
    try {
      const content = [];

      if (scopeHandoff) {
        content.push({ type: "text", text: `ScopeGPT Output (use this as the authoritative scope):\n${JSON.stringify(scopeHandoff)}` });
      }

      selectedPF.forEach((pf) => {
        if (!pf.b64) return;
        if (pf.file_type?.startsWith("image/"))
          content.push({ type: "image", source: { type: "base64", media_type: pf.file_type, data: pf.b64 } });
        else
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pf.b64 } });
      });

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
      const legacyResult = await callClaude(
        [{ role: "user", content }],
        `You are an expert construction scheduler. ${projectType === "remodel" ? "Focus on interior trades; only include exterior if documents explicitly call for them." : "Include full sequence: site work, excavation, foundation, framing, exterior, MEP, finishes."} Return valid JSON only, no markdown.`
      );

      const structured = ensureStructuredSchedule(legacyResult);
      setResult(structured);
      setStatus("done");

      const history = JSON.parse(localStorage.getItem("jsg_history") || "[]");
      history.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        projectId: activeProject?.id || null,
        tool: "ScheduleGPT",
        title: structured.projectName,
        date: new Date().toISOString(),
        summary: `${structured.schedule_tasks.length} tasks across ${structured.schedule_phases.length} phases · ${structured.totalDays} days`,
      });
      localStorage.setItem("jsg_history", JSON.stringify(history.slice(0, 100)));

      setGenerationId(null);
      setDirty(false);

      if (activeProject?.id) {
        saveGeneration(
          activeProject.id, "ScheduleGPT", structured.projectName,
          `${structured.schedule_tasks.length} tasks · ${structured.schedule_phases.length} phases · ${structured.totalDays} days`,
          legacyResult
        ).then((row) => { if (row?.id) setGenerationId(row.id); });
        try {
          await saveActiveSchedule(activeProject.id, {
            schedule_tasks: structured.schedule_tasks,
            schedule_phases: structured.schedule_phases,
            schedule_subcontractors: structured.schedule_subcontractors,
          });
        } catch (e) {
          console.warn("Active schedule save failed:", e.message);
        }
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
  if (result) (result.schedule_phases || []).forEach((p, i) => { phaseMap[p] = PHASE_COLORS[i % PHASE_COLORS.length]; });

  // Dependency UI keeps the legacy "type 1, 2" UX while storage uses UUIDs.
  // The ordinal maps below convert in both directions at render/input time.
  const { idToOrdinal, ordinalToId } = result
    ? buildScheduleOrdinalMaps(result.schedule_tasks || [])
    : { idToOrdinal: new Map(), ordinalToId: new Map() };

  const exportTSV = () => {
    if (!result) return;
    const lines = [`PROJECT SCHEDULE — ${result.projectName}\n`];
    lines.push("TASK SCHEDULE");
    lines.push(["#","Task","Phase","Trade","Start Day","Duration","Dependencies","Notes"].join("\t"));
    (result.schedule_tasks || []).forEach((t, idx) => lines.push([
      idx + 1, t.task, t.phase, t.trade, `Day ${t.startDay}`, `${t.durationDays}d`,
      (t.dependencies || []).map((d) => idToOrdinal.get(d)).filter(Boolean).join(",") || "—",
      t.notes || "",
    ].join("\t")));
    lines.push(`\nSUBCONTRACTOR WORKSHEET`);
    lines.push(["Trade","Phase","Est. Days","Sub Types","Scope"].join("\t"));
    (result.schedule_subcontractors || []).forEach((s) => lines.push([s.trade, s.phase, s.estimatedDays, (s.recommendedSubTypes || []).join(", "), s.scope].join("\t")));
    downloadTxt(`${result.projectName.replace(/\s+/g, "_")}_Schedule.tsv`, lines.join("\n"));
    showToast("Downloaded!");
  };

  const updateResult = (updater) => {
    if (inHistoryMode) return; // history mode is read-only
    setResult((prev) => prev ? updater(prev) : prev);
    setDirty(true);
  };

  const persistCurrent = async (current) => {
    // Active mode only. History-mode write path removed — historical rows
    // are immutable snapshots of AI output.
    if (!activeProject?.id) return;
    await saveActiveSchedule(activeProject.id, {
      schedule_tasks: current.schedule_tasks,
      schedule_phases: current.schedule_phases,
      schedule_subcontractors: current.schedule_subcontractors,
    });
  };

  const saveChanges = async () => {
    if (!result || inHistoryMode) return;
    if (!activeProject?.id) {
      showToast("Select a project before saving");
      return;
    }
    setSaving(true);
    try {
      await persistCurrent(result);
      setDirty(false);
      showToast("Changes saved!");
    } catch (e) {
      showToast("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dirty || !result) return;
    if (inHistoryMode) return; // history mode is read-only, no auto-save
    if (!activeProject?.id) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await persistCurrent(result);
        setDirty(false);
      } catch (e) {
        console.warn("Auto-save failed:", e.message);
      } finally {
        setSaving(false);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, result, inHistoryMode, activeProject?.id]);

  // ── Lock toggle ──────────────────────────────────────────────────────────
  const toggleLock = async () => {
    if (!activeProject?.id || lockBusy) return;
    if (locked) {
      if (!window.confirm(
        "Unlocking allows new AI generations to overwrite the current schedule. Your current items stay until you regenerate. Continue?"
      )) return;
    }
    setLockBusy(true);
    try {
      const next = !locked;
      await setScheduleLocked(activeProject.id, next);
      setLocked(next);
    } catch (e) {
      showToast("Could not change lock: " + e.message);
    } finally {
      setLockBusy(false);
    }
  };

  // ── Restore (history mode → active) ──────────────────────────────────────
  const restore = async () => {
    if (!result) return;
    const projectId = historyMeta?.projectId || activeProject?.id;
    if (!projectId) {
      showToast("Cannot restore — no project context.");
      return;
    }
    let activeLocked = false;
    try {
      const raw = await getProjectActiveSchedule(projectId);
      activeLocked = !!raw?.schedule_locked;
    } catch {}

    const confirmMsg = activeLocked
      ? "The active schedule is locked. Restoring this version will replace it. Unlock and restore?"
      : "Restore this version? It will replace your current active schedule.";
    if (!window.confirm(confirmMsg)) return;

    // Round-trip via legacy → structured: fresh UUIDs, completion all false.
    const fresh = ensureStructuredSchedule(flattenStructuredSchedule(result));
    setSaving(true);
    try {
      await saveActiveSchedule(projectId, {
        schedule_tasks: fresh.schedule_tasks,
        schedule_phases: fresh.schedule_phases,
        schedule_subcontractors: fresh.schedule_subcontractors,
      });
      if (activeLocked) {
        await setScheduleLocked(projectId, false);
      }
      setLocked(false);
      setResult(fresh);
      setGenerationId(null);
      setHistoryMeta(null);
      setDirty(false);
      const p = new URLSearchParams(searchParams);
      p.delete("historyId");
      setSearchParams(p, { replace: true });
      showToast("Restored — now editable as the active schedule.");
    } catch (e) {
      showToast("Restore failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const historyTimestamp = useMemo(() => {
    if (!historyMeta?.createdAt) return "";
    try { return new Date(historyMeta.createdAt).toLocaleString(); } catch { return ""; }
  }, [historyMeta]);

  // Apply edit → cascade dependent startDays → sort on the final startDays →
  // save. Cascade runs before the sort so downstream shifts are reflected in
  // the displayed order. One round of sorting per change.
  const applyTaskChange = (r, nextTasks) => {
    const cascaded = cascadeSchedule(nextTasks);
    const sorted = sortTasksByPhase(cascaded, r.schedule_phases || []);
    return { ...r, schedule_tasks: sorted, totalDays: computeTotalDays(sorted) };
  };

  const updateTask = (taskId, field, value) =>
    updateResult((r) => applyTaskChange(r, (r.schedule_tasks || []).map((t) => t.id === taskId ? { ...t, [field]: value } : t)));
  const deleteTask = (taskId) => {
    const tasks = result?.schedule_tasks || [];
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const dependents = tasks.filter((t) => (t.dependencies || []).includes(taskId));
    const msg = dependents.length > 0
      ? `${dependents.length} other task${dependents.length === 1 ? "" : "s"} depend on "${target.task || "this task"}". Deleting will remove ${dependents.length === 1 ? "that dependency" : "those dependencies"}. Continue?`
      : "Delete this task?";
    if (!window.confirm(msg)) return;
    updateResult((r) => {
      const filtered = (r.schedule_tasks || [])
        .filter((t) => t.id !== taskId)
        .map((t) => ({ ...t, dependencies: (t.dependencies || []).filter((d) => d !== taskId) }));
      return applyTaskChange(r, filtered);
    });
  };
  const addTask = () => {
    updateResult((r) => {
      const defaultPhase = r.schedule_phases?.[0] || "";
      const nextTasks = [...(r.schedule_tasks || []), makeBlankTask({ phase: defaultPhase }, "user_added")];
      return applyTaskChange(r, nextTasks);
    });
  };

  // Dependency input handler — converts a comma-separated string of ordinals
  // ("1, 2, 5") back into the UUID dependency array.
  const updateTaskDependencies = (taskId, raw) => {
    const ordinals = String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    const uuids = ordinals.map((n) => ordinalToId.get(n)).filter(Boolean);
    updateTask(taskId, "dependencies", uuids);
  };

  const updateSub = (idx, field, value) =>
    updateResult((r) => ({ ...r, schedule_subcontractors: (r.schedule_subcontractors || []).map((s, i) => i === idx ? { ...s, [field]: value } : s) }));
  const deleteSub = (idx) =>
    updateResult((r) => ({ ...r, schedule_subcontractors: (r.schedule_subcontractors || []).filter((_, i) => i !== idx) }));
  const addSub = () => {
    updateResult((r) => ({
      ...r,
      schedule_subcontractors: [...(r.schedule_subcontractors || []), { trade: "", phase: r.schedule_phases?.[0] || "", estimatedDays: 0, recommendedSubTypes: [], scope: "" }],
    }));
  };

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const toEmailHtml = (r, clientName, branding = {}) => {
    const { hasLogo, logoCid, companyName } = branding;
    const taskRows = (r.schedule_tasks || []).map((t, idx) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:11px;color:#909ab0;">${idx + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:13px;font-weight:600;">${esc(t.task)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#606880;">${esc(t.phase)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;color:#606880;">${esc(t.trade)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;">Day ${esc(t.startDay)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:12px;">${esc(t.durationDays)}d</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef1f6;font-size:11px;color:#909ab0;">${esc((t.dependencies || []).map((d) => idToOrdinal.get(d)).filter(Boolean).join(", ") || "—")}</td>
      </tr>`).join("");

    const subRows = (r.schedule_subcontractors || []).map((s) => `
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
          <div style="font-size:12px;color:#909ab0;">${esc(r.totalDays)} days · ${(r.schedule_tasks || []).length} tasks · ${(r.schedule_phases || []).length} phases</div>
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
    let logoSource = "";
    try {
      const settings = await getUserSettings();
      companyName = settings?.company_name || "";
      logoSource = settings?.company_logo || "";
    } catch {}

    const attachments = [];
    let hasLogo = false;
    const logoCid = "company-logo";
    const parsed = await loadLogoAttachment(logoSource);
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
    <div className={`fade-up${inHistoryMode ? " tool-readonly" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ProjectSwitcher activeProject={activeProject} onProjectChange={onProjectChange} />
        </div>
        {!inHistoryMode && activeProject?.id && (
          <LockToggle locked={locked} onToggle={toggleLock} disabled={lockBusy} />
        )}
      </div>

      {inHistoryMode && (
        <div className="history-banner">
          <div className="history-banner-text">
            <div className="history-banner-title">👁 Viewing a saved version (read-only)</div>
            {historyTimestamp && <div className="history-banner-meta">{historyTimestamp}</div>}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={restore}
            disabled={saving || !result}
          >
            {saving ? "Restoring…" : "↻ Restore This Version"}
          </button>
        </div>
      )}

      {locked && !inHistoryMode && (
        <div className="locked-banner">
          🔒 This schedule is locked as the project source of truth.
        </div>
      )}

      {(status === "idle" || status === "error") && (
        <>
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
            disabled={locked || (!scopeHandoff && files.length === 0 && selectedPF.length === 0 && !projName.trim())}
            title={locked ? "Unlock to regenerate" : undefined}
            onClick={generate}
          >
            📅 Generate Schedule
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
              <div className="stat-value">{(result.schedule_tasks || []).length}</div>
              <div className="stat-sub">
                {(() => {
                  const done = (result.schedule_tasks || []).filter((t) => t.completed).length;
                  const total = (result.schedule_tasks || []).length;
                  return total > 0 && done > 0
                    ? <>✓ {done} of {total} complete · across {(result.schedule_phases || []).length} phases</>
                    : <>across {(result.schedule_phases || []).length} phases</>;
                })()}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Trades</div>
              <div className="stat-value">{(result.schedule_subcontractors || []).length}</div>
              <div className="stat-sub">subcontractor rows</div>
            </div>
          </div>

          <div className="result-actions" style={{ marginBottom: 22 }}>
            <button className="btn btn-primary" onClick={exportTSV}>⬇ Download Schedule (.TSV)</button>
            {!inHistoryMode && (
              <>
                <button
                  className="btn"
                  style={{ borderColor: dirty ? "#f0a500" : "rgba(240,165,0,0.3)", color: dirty ? "#c47f00" : "#909ab0" }}
                  disabled={saving || !dirty}
                  onClick={saveChanges}
                >
                  {saving ? "Saving…" : dirty ? "💾 Save Changes" : "✓ Saved"}
                </button>
                <button className="btn" style={{ borderColor: "rgba(39,174,96,0.3)", color: "#27ae60" }} onClick={() => setSendOpen(true)}>✉ Send to Client</button>
                <button className="btn btn-ghost" onClick={reset}>↩ New Schedule</button>
              </>
            )}
          </div>

          <div className="section-label">Schedule Preview</div>
          <div style={{ overflowX: "auto", marginBottom: 24 }}>
            <table className="gantt-table">
              <thead>
                <tr>{["#","Task","Phase","Trade","Start","Days","Deps"].map((h) => <th key={h}>{h}</th>)}<th></th></tr>
              </thead>
              <tbody>
                {(result.schedule_tasks || []).map((t, idx) => {
                  const pc = phaseMap[t.phase] || PHASE_COLORS[0];
                  return (
                    <tr
                      key={t.id}
                      className={[originClassName(t.origin), t.completed ? "completed" : ""].filter(Boolean).join(" ") || undefined}
                      title={t.completed && t.completed_date ? `Completed ${t.completed_date}` : undefined}
                    >
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#c0c8d8", width: 44 }}>{idx + 1}</td>
                      <td>
                        <input className="edit-input" style={{ fontWeight: 600, fontSize: 12 }}
                          value={t.task}
                          onChange={(e) => updateTask(t.id, "task", e.target.value)}
                          readOnly={inHistoryMode} />
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <select
                          className="edit-input"
                          style={{ background: pc.bg, color: pc.color, fontSize: 11, padding: "3px 5px", border: "1px solid transparent", borderRadius: 4 }}
                          value={t.phase}
                          onChange={(e) => updateTask(t.id, "phase", e.target.value)}
                          disabled={inHistoryMode}
                        >
                          {(result.schedule_phases || []).map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{ color: "#606880", minWidth: 100 }}>
                        <input className="edit-input" style={{ fontSize: 12, color: "#606880" }}
                          value={t.trade}
                          onChange={(e) => updateTask(t.id, "trade", e.target.value)}
                          readOnly={inHistoryMode} />
                      </td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, width: 80 }}>
                        <input className="edit-input" style={{ fontSize: 11, width: 60 }} type="number" min="1"
                          value={t.startDay}
                          onChange={(e) => updateTask(t.id, "startDay", Number(e.target.value) || 1)}
                          readOnly={inHistoryMode} />
                      </td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, width: 70 }}>
                        <input className="edit-input" style={{ fontSize: 11, width: 50 }} type="number" min="1"
                          value={t.durationDays}
                          onChange={(e) => updateTask(t.id, "durationDays", Number(e.target.value) || 1)}
                          readOnly={inHistoryMode} />
                      </td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#c0c8d8", minWidth: 90 }}>
                        <input className="edit-input" style={{ fontSize: 10, color: "#606880" }}
                          value={(t.dependencies || []).map((d) => idToOrdinal.get(d)).filter(Boolean).join(", ")}
                          onChange={(e) => updateTaskDependencies(t.id, e.target.value)}
                          placeholder="e.g. 1, 2"
                          readOnly={inHistoryMode} />
                      </td>
                      <td className="row-delete-cell">
                        {!inHistoryMode && (
                          <button
                            type="button"
                            className="delete-icon-btn"
                            title="Delete task"
                            onClick={() => deleteTask(t.id)}
                          >🗑</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!inHistoryMode && (
              <button type="button" className="add-line-btn" onClick={addTask}>＋ Add Task</button>
            )}
          </div>

          <div className="section-label">Subcontractor Worksheet</div>
          <div style={{ overflowX: "auto" }}>
            <table className="sub-table">
              <thead>
                <tr>{["Trade","Phase","Est. Days","Sub Types","Scope"].map((h) => <th key={h}>{h}</th>)}<th></th></tr>
              </thead>
              <tbody>
                {(result.schedule_subcontractors || []).map((s, i) => {
                  const pc = phaseMap[s.phase] || PHASE_COLORS[0];
                  return (
                    <tr key={i}>
                      <td style={{ minWidth: 120 }}>
                        <input className="edit-input" style={{ fontWeight: 600, fontSize: 12 }}
                          value={s.trade}
                          onChange={(e) => updateSub(i, "trade", e.target.value)}
                          readOnly={inHistoryMode} />
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <select
                          className="edit-input"
                          style={{ background: pc.bg, color: pc.color, fontSize: 11, padding: "3px 5px", border: "1px solid transparent", borderRadius: 4 }}
                          value={s.phase}
                          onChange={(e) => updateSub(i, "phase", e.target.value)}
                          disabled={inHistoryMode}
                        >
                          {(result.schedule_phases || []).map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, width: 90 }}>
                        <input className="edit-input" style={{ fontSize: 11, width: 60 }} type="number" min="0"
                          value={s.estimatedDays}
                          onChange={(e) => updateSub(i, "estimatedDays", Number(e.target.value) || 0)}
                          readOnly={inHistoryMode} />
                      </td>
                      <td style={{ fontSize: 11, color: "#606880", minWidth: 160 }}>
                        <input className="edit-input" style={{ fontSize: 11, color: "#606880" }}
                          value={(s.recommendedSubTypes || []).join(", ")}
                          onChange={(e) => updateSub(i, "recommendedSubTypes", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
                          readOnly={inHistoryMode} />
                      </td>
                      <td style={{ fontSize: 11, color: "#606880", minWidth: 180 }}>
                        <input className="edit-input" style={{ fontSize: 11, color: "#606880" }}
                          value={s.scope}
                          onChange={(e) => updateSub(i, "scope", e.target.value)}
                          readOnly={inHistoryMode} />
                      </td>
                      <td className="row-delete-cell">
                        {!inHistoryMode && (
                          <button
                            type="button"
                            className="delete-icon-btn"
                            title="Delete row"
                            onClick={() => deleteSub(i)}
                          >🗑</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!inHistoryMode && (
              <button type="button" className="add-line-btn" onClick={addSub}>＋ Add Subcontractor</button>
            )}
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
