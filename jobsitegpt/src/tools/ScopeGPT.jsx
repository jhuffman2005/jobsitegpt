import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { callClaude, downloadTxt, downloadDoc, checkPayloadSize } from "../lib/api";
import { useFiles, useToast } from "../lib/hooks";
import {
  getProjectFileAsBase64, saveGeneration, updateGeneration, getGenerationById,
  getUserSettings, getProjectBidInvitations,
  getProjectActiveScope, saveActiveScope,
} from "../lib/projects";
import { resolveBranding, sendTradeInvitation } from "../lib/tradeInvites";
import { loadLogoAttachment } from "../lib/companyLogo";
import {
  ensureStructuredScope, flattenStructuredScope,
  makeBlankLineItem, makeBlankNoteItem, makeBlankTrade,
} from "../lib/structuredData";
import { ProcessingSteps, UploadZone, ProjectFilePicker, SpecialInstructions } from "../components/SharedComponents";
import ProjectSwitcher from "../components/ProjectSwitcher";
import SendToClientModal from "../components/SendToClientModal";
import SendToTradesModal from "../components/SendToTradesModal";

const STEPS = [
  "Uploading documents…",
  "Analyzing project scope…",
  "Building trade breakdown…",
  "Finalizing scope document…",
];

const STORAGE_KEY = "jsg_scope_result";

// sessionStorage cache for back-button restore. The cached blob is the
// structured shape (matches what state holds), tagged with the project it
// belongs to so a scope generated under Project A never leaks into B.
function loadSavedResult(projectId) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      if ((parsed.projectId || null) !== (projectId || null)) return null;
      // Tolerate either shape so a session that pre-dates the migration
      // doesn't poison restore.
      return ensureStructuredScope(parsed.data);
    }
    return null;
  } catch { return null; }
}

function persistResult(projectId, data) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ projectId: projectId || null, data }));
  } catch {}
}

// Build a structured result by pulling the active scope columns from the
// project and overlaying header metadata (projectName, overview, etc.) from
// the most recent ScopeGPT generation. Returns null if the project has no
// scope_trades populated AND no generation history — caller treats that as
// "no scope yet, show the empty form".
async function loadActiveScope(projectId) {
  if (!projectId) return null;
  const active = await getProjectActiveScope(projectId);
  if (!active?.scope_trades) return null;

  // Header metadata isn't on the active columns; pull from the latest
  // generation (which is in legacy shape and carries projectName/overview).
  let meta = {};
  try {
    const { supabase } = await import("../lib/supabaseClient");
    const { data } = await supabase
      .from("project_generations")
      .select("result_data")
      .eq("project_id", projectId)
      .eq("tool", "ScopeGPT")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.result_data) {
      meta = {
        projectName: data.result_data.projectName ?? "",
        projectType: data.result_data.projectType ?? "",
        projectAddress: data.result_data.projectAddress ?? null,
        overview: data.result_data.overview ?? "",
        estimatedDuration: data.result_data.estimatedDuration ?? "",
      };
    }
  } catch {}

  return {
    ...meta,
    totalLineItemCount: (active.scope_trades || []).reduce((n, t) => n + (t?.lineItems?.length || 0), 0),
    scope_trades: active.scope_trades || [],
    scope_notes: active.scope_notes || { generalConditions: [], exclusions: [], clarifications: [] },
  };
}

export default function ScopeGPT({ activeProject, onProjectChange }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const historyId = searchParams.get("historyId");
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("Residential Remodel");
  const [notes, setNotes] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();
  const [sendOpen, setSendOpen] = useState(false);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [invitedMap, setInvitedMap] = useState(new Map());
  const [generationId, setGenerationId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedPF, setSelectedPF] = useState([]);
  const [loadingPF, setLoadingPF] = useState(new Set());

  // Inline "+ Add Trade" form state. Stays collapsed until clicked; saves
  // append a structured trade with origin: "user_added" to scope_trades.
  const [newTradeOpen, setNewTradeOpen] = useState(false);
  const [newTradeFields, setNewTradeFields] = useState({ tradeName: "", contractor: "", scopeText: "" });
  const [newTradeError, setNewTradeError] = useState(false);

  const inHistoryMode = !!historyId;

  // On mount / project change: if we're in history mode, ?historyId hydration
  // below handles loading. Otherwise try the sessionStorage cache (back
  // button), then fall back to the project's active scope columns.
  const prevProjectIdRef = useRef(activeProject?.id);
  useEffect(() => {
    if (inHistoryMode) return;
    const projChanged = activeProject?.id !== prevProjectIdRef.current;
    prevProjectIdRef.current = activeProject?.id;

    if (!projChanged && status !== "idle") return;

    const cached = loadSavedResult(activeProject?.id);
    if (cached) {
      setResult(cached);
      setStatus("done");
      setError("");
      setGenerationId(null);
      setDirty(false);
      return;
    }

    if (!activeProject?.id) {
      setResult(null);
      setStatus("idle");
      setSelectedPF([]);
      setError("");
      setGenerationId(null);
      setDirty(false);
      resetFiles();
      return;
    }

    let cancelled = false;
    (async () => {
      const active = await loadActiveScope(activeProject.id);
      if (cancelled) return;
      if (active) {
        setResult(active);
        setStatus("done");
        setError("");
        setGenerationId(null);
        setDirty(false);
        persistResult(activeProject.id, active);
      } else {
        setSelectedPF([]);
        setResult(null);
        setStatus("idle");
        setError("");
        setProjectName("");
        setNotes("");
        setSpecialInstructions("");
        setGenerationId(null);
        setDirty(false);
        resetFiles();
      }
    })();
    return () => { cancelled = true; };
  }, [activeProject?.id, inHistoryMode]);

  // Hydrate from a saved generation when navigated here with ?historyId=.
  // Historical rows are stored in legacy shape; normalize to structured for
  // the editor.
  useEffect(() => {
    if (!historyId) return;
    let cancelled = false;
    (async () => {
      const g = await getGenerationById(historyId);
      if (cancelled) return;
      if (g?.result_data) {
        const structured = ensureStructuredScope(g.result_data);
        setResult(structured);
        setStatus("done");
        setError("");
        setGenerationId(g.id);
        setDirty(false);
        persistResult(g.project_id ?? activeProject?.id, structured);
      }
    })();
    return () => { cancelled = true; };
  }, [historyId]);

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
    const sizeError = checkPayloadSize({ files, projectFiles: selectedPF });
    if (sizeError) {
      setError(sizeError);
      setStatus("error");
      return;
    }
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1900));
    try {
      const content = [];

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
      const legacyResult = await callClaude(
        [{ role: "user", content }],
        "You are an expert GC with 20+ years writing professional scopes of work. Be thorough and complete. Return valid JSON only, no markdown, no explanation, no preamble."
      );

      const structured = ensureStructuredScope(legacyResult);
      setResult(structured);
      setStatus("done");
      persistResult(activeProject?.id, structured);

      const history = JSON.parse(localStorage.getItem("jsg_history") || "[]");
      history.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        projectId: activeProject?.id || null,
        tool: "ScopeGPT",
        title: structured.projectName,
        date: new Date().toISOString(),
        summary: structured.overview,
      });
      localStorage.setItem("jsg_history", JSON.stringify(history.slice(0, 100)));

      setGenerationId(null);
      setDirty(false);

      // Write a new project_generations row (legacy shape, historical record)
      // AND overwrite the active columns on the project (structured shape).
      if (activeProject?.id) {
        saveGeneration(activeProject.id, "ScopeGPT", structured.projectName, structured.overview, legacyResult)
          .then((row) => { if (row?.id) setGenerationId(row.id); });
        try {
          await saveActiveScope(activeProject.id, {
            scope_trades: structured.scope_trades,
            scope_notes: structured.scope_notes,
          });
        } catch (e) {
          console.warn("Active scope save failed:", e.message);
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
    setProjectName(""); setNotes(""); setSpecialInstructions("");
    setSelectedPF([]); setStatus("idle"); setResult(null); setError("");
    setGenerationId(null); setDirty(false);
    sessionStorage.removeItem(STORAGE_KEY);
    if (historyId) {
      const p = new URLSearchParams(searchParams);
      p.delete("historyId");
      setSearchParams(p, { replace: true });
    }
  };

  const goToSchedule = () => {
    // Schedule handoff expects a parseable scope; pass the legacy shape since
    // ScheduleGPT's prompt instructs Claude to parse the legacy fields.
    sessionStorage.setItem("jsg_scope_handoff", JSON.stringify(flattenStructuredScope(result)));
    navigate("/schedule");
  };

  const toText = (r) => {
    const lines = [`SCOPE OF WORK\n=============\nProject: ${r.projectName}\nType: ${r.projectType}\nDuration: ${r.estimatedDuration}\n\nOVERVIEW\n--------\n${r.overview}\n`];
    (r.scope_trades || []).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.tradeName.toUpperCase()} [${t.contractor}]\n   ${t.scopeText}`);
      (t.lineItems || []).forEach((li) => lines.push(`   • ${li.description}${li.note ? ` (${li.note})` : ""}`));
      lines.push("");
    });
    const noteText = (arr) => (arr || []).map((n) => n.text);
    const gc = noteText(r.scope_notes?.generalConditions);
    const ex = noteText(r.scope_notes?.exclusions);
    const cl = noteText(r.scope_notes?.clarifications);
    if (gc.length) { lines.push("GENERAL CONDITIONS\n------------------"); gc.forEach((g) => lines.push(`• ${g}`)); lines.push(""); }
    if (ex.length) { lines.push("EXCLUSIONS\n----------"); ex.forEach((e) => lines.push(`• ${e}`)); lines.push(""); }
    if (cl.length) { lines.push("CLARIFICATIONS\n--------------"); cl.forEach((c) => lines.push(`• ${c}`)); }
    return lines.join("\n");
  };

  // updateResult: persists locally and routes the save by mode. Active mode
  // writes structured to projects.scope_*; history mode writes legacy back
  // to project_generations (existing behavior).
  const updateResult = (updater) => {
    setResult((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      persistResult(activeProject?.id, next);
      return next;
    });
    setDirty(true);
  };

  const persistCurrent = async (current) => {
    if (inHistoryMode && generationId) {
      await updateGeneration(generationId, {
        title: current.projectName,
        summary: current.overview,
        result_data: flattenStructuredScope(current),
      });
    } else if (activeProject?.id) {
      await saveActiveScope(activeProject.id, {
        scope_trades: current.scope_trades,
        scope_notes: current.scope_notes,
      });
    }
  };

  const saveChanges = async () => {
    if (!result) return;
    if (!inHistoryMode && !activeProject?.id) {
      showToast("Select a project before saving");
      return;
    }
    if (inHistoryMode && !generationId) {
      showToast("No saved scope to update");
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
    if (inHistoryMode && !generationId) return;
    if (!inHistoryMode && !activeProject?.id) return;
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
  }, [dirty, generationId, result, inHistoryMode, activeProject?.id]);

  const updateTrade = (tradeId, field, value) =>
    updateResult((r) => ({
      ...r,
      scope_trades: r.scope_trades.map((t) => t.id === tradeId ? { ...t, [field]: value } : t),
    }));
  const updateLineItem = (tradeId, lineItemId, field, value) =>
    updateResult((r) => ({
      ...r,
      scope_trades: r.scope_trades.map((t) => t.id === tradeId
        ? { ...t, lineItems: t.lineItems.map((li) => li.id === lineItemId ? { ...li, [field]: value } : li) }
        : t),
    }));
  const deleteLineItem = (tradeId, lineItemId) => {
    if (!window.confirm("Delete this line item?")) return;
    updateResult((r) => ({
      ...r,
      scope_trades: r.scope_trades.map((t) => t.id === tradeId
        ? { ...t, lineItems: t.lineItems.filter((li) => li.id !== lineItemId) }
        : t),
    }));
  };
  const addLineItem = (tradeId) =>
    updateResult((r) => ({
      ...r,
      scope_trades: r.scope_trades.map((t) => t.id === tradeId
        ? { ...t, lineItems: [...(t.lineItems || []), makeBlankLineItem("user_added")] }
        : t),
    }));

  const deleteTrade = (tradeId) => {
    const target = (result?.scope_trades || []).find((t) => t.id === tradeId);
    if (!target) return;
    const lineCount = target.lineItems?.length || 0;
    const msg = lineCount > 0
      ? `Delete the "${target.tradeName || "untitled"}" trade and all ${lineCount} line item${lineCount === 1 ? "" : "s"}? This cannot be undone.`
      : `Delete the "${target.tradeName || "untitled"}" trade? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    updateResult((r) => ({
      ...r,
      scope_trades: (r.scope_trades || []).filter((t) => t.id !== tradeId),
    }));
  };

  const openNewTrade = () => {
    setNewTradeFields({ tradeName: "", contractor: "", scopeText: "" });
    setNewTradeError(false);
    setNewTradeOpen(true);
  };
  const cancelNewTrade = () => {
    setNewTradeFields({ tradeName: "", contractor: "", scopeText: "" });
    setNewTradeError(false);
    setNewTradeOpen(false);
  };
  const saveNewTrade = () => {
    if (!newTradeFields.tradeName.trim()) {
      setNewTradeError(true);
      return;
    }
    const trade = makeBlankTrade({
      tradeName: newTradeFields.tradeName.trim(),
      contractor: newTradeFields.contractor.trim(),
      scopeText: newTradeFields.scopeText.trim(),
    });
    updateResult((r) => ({
      ...r,
      scope_trades: [...(r.scope_trades || []), trade],
    }));
    cancelNewTrade();
  };
  const onNewTradeKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      saveNewTrade();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelNewTrade();
    }
  };

  const updateNote = (field, itemId, value) =>
    updateResult((r) => ({
      ...r,
      scope_notes: {
        ...r.scope_notes,
        [field]: (r.scope_notes?.[field] || []).map((x) => x.id === itemId ? { ...x, text: value } : x),
      },
    }));
  const deleteNote = (field, itemId) => {
    if (!window.confirm("Delete this item?")) return;
    updateResult((r) => ({
      ...r,
      scope_notes: {
        ...r.scope_notes,
        [field]: (r.scope_notes?.[field] || []).filter((x) => x.id !== itemId),
      },
    }));
  };
  const addNote = (field) =>
    updateResult((r) => ({
      ...r,
      scope_notes: {
        ...r.scope_notes,
        [field]: [...(r.scope_notes?.[field] || []), makeBlankNoteItem("user_added")],
      },
    }));
  const updateOverview = (value) => updateResult((r) => ({ ...r, overview: value }));

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const toWordHtml = (r) => {
    const noteTexts = (arr) => (arr || []).map((n) => n.text);
    const tradeBlocks = (r.scope_trades || []).map((t, i) => `
      <h2 style="font-size:14pt;color:#1a1f2e;margin:18pt 0 4pt;border-bottom:1pt solid #d0d4dc;padding-bottom:3pt;">${i + 1}. ${esc(t.tradeName)} <span style="font-size:10pt;color:#c47f00;font-weight:normal;">[${esc(t.contractor)}]</span></h2>
      <p style="margin:6pt 0;">${esc(t.scopeText)}</p>
      ${t.lineItems?.length ? `<ul style="margin:6pt 0 6pt 24pt;">${t.lineItems.map((li) => `<li style="margin-bottom:3pt;">${esc(li.description)}${li.note ? ` <i style="color:#606880;">— ${esc(li.note)}</i>` : ""}</li>`).join("")}</ul>` : ""}`).join("");

    const listSection = (title, items) => items?.length
      ? `<h2 style="font-size:13pt;color:#1a1f2e;margin:18pt 0 6pt;border-bottom:1pt solid #d0d4dc;padding-bottom:3pt;">${title}</h2>
         <ul style="margin:6pt 0 6pt 24pt;">${items.map((x) => `<li style="margin-bottom:3pt;">${esc(x)}</li>`).join("")}</ul>`
      : "";

    return `
      <h1 style="font-size:22pt;color:#1a1f2e;margin:0 0 4pt;">Scope of Work</h1>
      <h2 style="font-size:16pt;color:#1a1f2e;margin:0 0 4pt;border:none;padding:0;">${esc(r.projectName)}</h2>
      <p style="font-size:10pt;color:#606880;margin:0 0 18pt;">${esc(r.projectType)}${r.projectAddress ? ` · ${esc(r.projectAddress)}` : ""} · ${esc(r.estimatedDuration)}</p>
      <h2 style="font-size:13pt;color:#1a1f2e;margin:18pt 0 6pt;border-bottom:1pt solid #d0d4dc;padding-bottom:3pt;">Overview</h2>
      <p style="margin:6pt 0;">${esc(r.overview)}</p>
      <h2 style="font-size:13pt;color:#1a1f2e;margin:18pt 0 6pt;border-bottom:1pt solid #d0d4dc;padding-bottom:3pt;">Scope by Trade</h2>
      ${tradeBlocks}
      ${listSection("General Conditions", noteTexts(r.scope_notes?.generalConditions))}
      ${listSection("Exclusions", noteTexts(r.scope_notes?.exclusions))}
      ${listSection("Clarifications", noteTexts(r.scope_notes?.clarifications))}`;
  };

  const downloadWord = () => {
    const safeName = result.projectName.replace(/\s+/g, "_");
    downloadDoc(`${safeName}_Scope.doc`, toWordHtml(result), `${result.projectName} — Scope of Work`);
  };

  const toEmailHtml = (r, clientName, branding = {}) => {
    const { hasLogo, logoCid, companyName } = branding;
    const noteTexts = (arr) => (arr || []).map((n) => n.text);
    const tradeBlocks = (r.scope_trades || []).map((t, i) => `
      <div style="margin:0 0 22px;padding:16px 18px;background:#f8f9fc;border:1px solid #e0e4ef;border-radius:8px;">
        <div style="font-size:11px;letter-spacing:0.08em;color:#909ab0;text-transform:uppercase;margin-bottom:4px;">Trade #${String(i + 1).padStart(2, "0")} · ${esc(t.contractor)}</div>
        <div style="font-weight:700;font-size:16px;color:#1a1f2e;margin-bottom:8px;">${esc(t.tradeName)}</div>
        <div style="font-size:13px;line-height:1.6;color:#1a1f2e;margin-bottom:10px;">${esc(t.scopeText)}</div>
        ${t.lineItems?.length ? `<ul style="margin:0;padding-left:18px;color:#1a1f2e;">${t.lineItems.map((li) => `<li style="font-size:13px;line-height:1.6;margin-bottom:3px;">${esc(li.description)}${li.note ? ` <span style="color:#909ab0;font-style:italic;">— ${esc(li.note)}</span>` : ""}</li>`).join("")}</ul>` : ""}
      </div>`).join("");

    const listSection = (title, items) => items?.length
      ? `<h3 style="font-size:12px;letter-spacing:0.12em;color:#909ab0;text-transform:uppercase;margin:24px 0 10px;">${title}</h3>
         <ul style="margin:0;padding-left:18px;color:#1a1f2e;">${items.map((x) => `<li style="font-size:13px;line-height:1.6;margin-bottom:4px;">${esc(x)}</li>`).join("")}</ul>`
      : "";

    const brandingHeader = (hasLogo || companyName)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:18px;"><tr>
           ${hasLogo ? `<td style="padding:0 14px 18px 0;border-bottom:1px solid #f0f2f5;vertical-align:middle;width:1%;white-space:nowrap;"><img src="cid:${logoCid}" alt="${esc(companyName || "Company")}" style="display:block;max-height:60px;max-width:180px;object-fit:contain;border:0;outline:none;" /></td>` : ""}
           ${companyName ? `<td style="padding:0 0 18px;border-bottom:1px solid #f0f2f5;vertical-align:middle;font-weight:700;font-size:15px;letter-spacing:0.04em;color:#1a1f2e;">${esc(companyName)}</td>` : ""}
         </tr></table>`
      : "";

    const footerSender = companyName ? esc(companyName) : "JobSiteGPT";

    return `<!doctype html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#1a1f2e;">
      <div style="max-width:680px;margin:0 auto;padding:24px;">
        <div style="background:#ffffff;border:1px solid #e0e4ef;border-top:3px solid #f0a500;border-radius:8px;padding:28px 30px;">
          ${brandingHeader}
          <div style="font-size:11px;letter-spacing:0.12em;color:#909ab0;text-transform:uppercase;margin-bottom:8px;">Scope of Work</div>
          <h1 style="font-size:24px;margin:0 0 6px;color:#1a1f2e;letter-spacing:0.02em;">${esc(r.projectName)}</h1>
          <div style="font-size:12px;color:#909ab0;">${esc(r.projectType)}${r.projectAddress ? ` · ${esc(r.projectAddress)}` : ""} · ${esc(r.estimatedDuration)}</div>
          ${clientName ? `<p style="font-size:14px;color:#1a1f2e;margin:22px 0 0;">Hi ${esc(clientName)},</p>
          <p style="font-size:14px;color:#1a1f2e;line-height:1.6;margin:8px 0 0;">Please find below the proposed scope of work for your project. Let me know if you have any questions or would like to discuss changes.</p>` : ""}
          <h3 style="font-size:12px;letter-spacing:0.12em;color:#909ab0;text-transform:uppercase;margin:24px 0 10px;">Overview</h3>
          <div style="font-size:14px;line-height:1.65;color:#1a1f2e;margin-bottom:18px;">${esc(r.overview)}</div>
          <h3 style="font-size:12px;letter-spacing:0.12em;color:#909ab0;text-transform:uppercase;margin:24px 0 10px;">Scope by Trade</h3>
          ${tradeBlocks}
          ${listSection("General Conditions", noteTexts(r.scope_notes?.generalConditions))}
          ${listSection("Exclusions", noteTexts(r.scope_notes?.exclusions))}
          ${listSection("Clarifications", noteTexts(r.scope_notes?.clarifications))}
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
        subject: `Scope of Work — ${result.projectName}`,
        html: toEmailHtml(result, clientName, { hasLogo, logoCid, companyName }),
        from_name: fromName,
        attachments,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Email failed");
    setSendOpen(false);
    showToast("Scope sent to client!");
  };

  const openSendToTrades = async () => {
    if (activeProject?.id) {
      try {
        const invites = await getProjectBidInvitations(activeProject.id);
        const map = new Map();
        invites.forEach((i) => map.set(i.trade_name, (map.get(i.trade_name) || 0) + 1));
        setInvitedMap(map);
      } catch { setInvitedMap(new Map()); }
    } else {
      setInvitedMap(new Map());
    }
    setTradesOpen(true);
  };

  const [tradeBranding, setTradeBranding] = useState(null);
  useEffect(() => {
    if (!tradesOpen) { setTradeBranding(null); return; }
    let cancelled = false;
    resolveBranding().then((b) => { if (!cancelled) setTradeBranding(b); });
    return () => { cancelled = true; };
  }, [tradesOpen]);

  // The modal expects legacy shape (it has been around since before this
  // migration and reads scope.trades). We flatten here so the modal stays
  // shape-agnostic.
  const flatScopeForModal = result ? flattenStructuredScope(result) : null;

  const tradeSendHandler = (row) => {
    const trade = (result.scope_trades || []).find((t) => t.tradeName === row.tradeName);
    if (!trade) throw new Error("Trade not found in scope");
    return sendTradeInvitation({
      scope: result, // structured — buildLegacyTradeSnapshot flattens internally
      trade: { ...trade, contractor: row.contractor || trade.contractor },
      contactName: row.contactName,
      email: row.email,
      branding: tradeBranding || {},
      projectId: activeProject?.id || null,
      generationId: generationId || null,
    });
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
              {result.projectType}{result.projectAddress ? ` · ${result.projectAddress}` : ""} · {result.estimatedDuration} · {(result.scope_trades || []).reduce((n, t) => n + (t.lineItems?.length || 0), 0)} line items / {(result.scope_trades || []).length} trades
            </div>
            <div className="result-actions">
              <button className="btn btn-primary" onClick={downloadWord}>⬇ Download Word</button>
              <button className="btn" onClick={() => downloadTxt(`${result.projectName.replace(/\s+/g, "_")}_Scope.txt`, toText(result))}>⬇ .txt</button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(toText(result)); showToast("Copied!"); }}>⧉ Copy</button>
              <button
                className="btn"
                style={{ borderColor: dirty ? "#f0a500" : "rgba(240,165,0,0.3)", color: dirty ? "#c47f00" : "#909ab0" }}
                disabled={saving || !dirty}
                onClick={saveChanges}
              >
                {saving ? "Saving…" : dirty ? "💾 Save Changes" : "✓ Saved"}
              </button>
              <button className="btn" style={{ borderColor: "rgba(39,174,96,0.3)", color: "#27ae60" }} onClick={() => setSendOpen(true)}>✉ Send to Client</button>
              <button className="btn" style={{ borderColor: "rgba(74,144,226,0.3)", color: "#4a90e2" }} disabled={!result?.scope_trades?.length} onClick={openSendToTrades}>📤 Send to Trades</button>
              <button className="btn btn-ghost" onClick={reset}>↩ New Scope</button>
            </div>
          </div>

          <div className="handoff-banner">
            <div style={{ fontSize: 22 }}>📅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: "#4a90e2", marginBottom: 3 }}>Ready to build the schedule?</div>
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
          {(result.scope_trades || []).map((t, idx) => (
            <div key={t.id} className={`trade-block${t.origin === "user_added" ? " user-added" : ""}`}>
              <div className="trade-header editable-row">
                <span className="trade-num">#{String(idx + 1).padStart(2, "0")}</span>
                <input
                  className="edit-input"
                  style={{ flex: 1, fontWeight: 700, fontSize: 16, letterSpacing: "0.04em", color: "#1a1f2e" }}
                  value={t.tradeName}
                  onChange={(e) => updateTrade(t.id, "tradeName", e.target.value)}
                />
                <input
                  className="edit-input"
                  style={{ width: 160, fontSize: 11, color: "#c47f00", textAlign: "center" }}
                  value={t.contractor}
                  onChange={(e) => updateTrade(t.id, "contractor", e.target.value)}
                />
                <button
                  type="button"
                  className="delete-icon-btn"
                  title="Delete trade"
                  onClick={() => deleteTrade(t.id)}
                >🗑</button>
              </div>
              <div className="trade-body">
                <textarea
                  className="edit-textarea"
                  style={{ fontSize: 13, lineHeight: 1.7, color: "#1a1f2e", marginBottom: 12 }}
                  value={t.scopeText}
                  onChange={(e) => updateTrade(t.id, "scopeText", e.target.value)}
                />
                <div className="line-items">
                  {(t.lineItems || []).map((li) => (
                    <div key={li.id} className={`line-item editable-row${li.origin === "user_added" ? " user-added" : ""}`}>
                      <span className="line-bullet">▸</span>
                      <div className="edit-body">
                        <input
                          className="edit-input"
                          style={{ fontSize: 13 }}
                          value={li.description}
                          onChange={(e) => updateLineItem(t.id, li.id, "description", e.target.value)}
                          placeholder="Line item description"
                        />
                        <input
                          className="edit-input"
                          style={{ fontSize: 11, fontStyle: "italic", color: "#909ab0" }}
                          value={li.note || ""}
                          onChange={(e) => updateLineItem(t.id, li.id, "note", e.target.value || null)}
                          placeholder="Optional note"
                        />
                      </div>
                      <button
                        type="button"
                        className="delete-icon-btn"
                        title="Delete line"
                        onClick={() => deleteLineItem(t.id, li.id)}
                      >🗑</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="add-line-btn" onClick={() => addLineItem(t.id)}>＋ Add Line</button>
              </div>
            </div>
          ))}

          {newTradeOpen ? (
            <div className="new-trade-form" onKeyDown={onNewTradeKey}>
              <input
                className={`edit-input${newTradeError && !newTradeFields.tradeName.trim() ? " field-required" : ""}`}
                style={{ fontWeight: 700, fontSize: 16 }}
                placeholder="Trade name (required) — e.g. Electrical"
                value={newTradeFields.tradeName}
                onChange={(e) => setNewTradeFields((f) => ({ ...f, tradeName: e.target.value }))}
                autoFocus
              />
              <input
                className="edit-input"
                style={{ fontSize: 12 }}
                placeholder="Contractor (optional)"
                value={newTradeFields.contractor}
                onChange={(e) => setNewTradeFields((f) => ({ ...f, contractor: e.target.value }))}
              />
              <textarea
                className="edit-textarea"
                placeholder="Scope description (optional)"
                value={newTradeFields.scopeText}
                onChange={(e) => setNewTradeFields((f) => ({ ...f, scopeText: e.target.value }))}
              />
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={cancelNewTrade}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={saveNewTrade}>Save Trade</button>
              </div>
            </div>
          ) : (
            <button type="button" className="add-line-btn" style={{ marginBottom: 14 }} onClick={openNewTrade}>＋ Add Trade</button>
          )}

          {renderNotesSection("General Conditions", "generalConditions", result.scope_notes?.generalConditions, { topMargin: 22, updateNote, deleteNote, addNote })}
          {renderNotesSection("Exclusions", "exclusions", result.scope_notes?.exclusions, { updateNote, deleteNote, addNote })}
          {renderNotesSection("Clarifications", "clarifications", result.scope_notes?.clarifications, { updateNote, deleteNote, addNote })}

          <div className="result-actions" style={{ marginTop: 24 }}>
            <button className="btn btn-primary" onClick={downloadWord}>⬇ Download Word</button>
            <button className="btn" onClick={() => downloadTxt(`${result.projectName.replace(/\s+/g, "_")}_Scope.txt`, toText(result))}>⬇ .txt</button>
            <button className="btn" style={{ borderColor: "rgba(39,174,96,0.3)", color: "#27ae60" }} onClick={() => setSendOpen(true)}>✉ Send to Client</button>
            <button className="btn" style={{ borderColor: "rgba(74,144,226,0.3)", color: "#4a90e2" }} disabled={!result?.scope_trades?.length} onClick={openSendToTrades}>📤 Send to Trades</button>
            <button className="btn" style={{ borderColor: "rgba(74,144,226,0.3)", color: "#4a90e2" }} onClick={goToSchedule}>📅 Open in ScheduleGPT</button>
            <button className="btn btn-ghost" onClick={reset}>↩ Start Over</button>
          </div>
        </>
      )}

      <SendToClientModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        onSend={sendToClient}
        projectName={result?.projectName}
        docType="Scope of Work"
      />
      <SendToTradesModal
        isOpen={tradesOpen}
        onClose={() => setTradesOpen(false)}
        onSend={tradeSendHandler}
        scope={flatScopeForModal}
        alreadyInvited={invitedMap}
      />
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

function renderNotesSection(title, field, items, helpers) {
  const { updateNote, deleteNote, addNote, topMargin } = helpers;
  const list = items || [];
  return (
    <>
      <div className="section-label" style={topMargin ? { marginTop: topMargin } : undefined}>{title}</div>
      <div className="notes-block">
        <div className="notes-list">
          {list.map((item) => (
            <div key={item.id} className={`notes-item editable-row${item.origin === "user_added" ? " user-added" : ""}`} style={{ display: "flex" }}>
              <div className="edit-body" style={{ flex: 1 }}>
                <input
                  className="edit-input"
                  value={item.text}
                  onChange={(e) => updateNote(field, item.id, e.target.value)}
                  placeholder={`${title.slice(0, -1)}…`}
                />
              </div>
              <button
                type="button"
                className="delete-icon-btn"
                title="Delete"
                onClick={() => deleteNote(field, item.id)}
              >🗑</button>
            </div>
          ))}
        </div>
        <button type="button" className="add-line-btn" onClick={() => addNote(field)}>＋ Add Line</button>
      </div>
    </>
  );
}
