import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { callClaude, downloadTxt } from "../lib/api";
import { useFiles, useToast } from "../lib/hooks";
import { getProjectFileAsBase64, saveGeneration, updateGeneration, getGenerationById, getUserSettings } from "../lib/projects";
import { ProcessingSteps, UploadZone, ProjectFilePicker, SpecialInstructions } from "../components/SharedComponents";
import ProjectSwitcher from "../components/ProjectSwitcher";
import SendToClientModal from "../components/SendToClientModal";

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

function parseLogoDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const ext = (mime.split("/")[1] || "png").split("+")[0];
  return { mime, base64: m[2], filename: `logo.${ext}` };
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
  const [status, setStatus] = useState(() => loadSavedResult() ? "done" : "idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(loadSavedResult);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();
  const [sendOpen, setSendOpen] = useState(false);
  const [generationId, setGenerationId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Project file picker state
  const [selectedPF, setSelectedPF] = useState([]); // { id, file_name, file_type, storage_path, b64 }
  const [loadingPF, setLoadingPF] = useState(new Set());

  // Clear saved result when project changes so stale data from a previous project never shows.
  // Skip clearing on the initial mount (so edits persist when navigating away and back) and
  // when hydrating a historical generation via ?historyId=.
  const prevProjectIdRef = useRef(activeProject?.id);
  useEffect(() => {
    if (historyId) return;
    if (activeProject?.id === prevProjectIdRef.current) return;
    prevProjectIdRef.current = activeProject?.id;
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
        // Persist for back-button support, mirroring a freshly-generated result
        try { sessionStorage.setItem("jsg_scope_result", JSON.stringify(g.result_data)); } catch {}
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
      setGenerationId(null);
      setDirty(false);
      if (activeProject?.id) {
        saveGeneration(activeProject.id, "ScopeGPT", r.projectName, r.overview, r).then((row) => {
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
    setProjectName(""); setNotes(""); setSpecialInstructions("");
    setSelectedPF([]); setStatus("idle"); setResult(null); setError("");
    setGenerationId(null); setDirty(false);
    sessionStorage.removeItem("jsg_scope_result");
    if (historyId) {
      const p = new URLSearchParams(searchParams);
      p.delete("historyId");
      setSearchParams(p, { replace: true });
    }
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

  // Persisting edits: update result and mirror to sessionStorage
  const updateResult = (updater) => {
    setResult((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      try { sessionStorage.setItem("jsg_scope_result", JSON.stringify(next)); } catch {}
      return next;
    });
    setDirty(true);
  };

  const saveChanges = async () => {
    if (!result) return;
    if (!generationId) {
      showToast("No saved scope to update — select or generate one under a project");
      return;
    }
    setSaving(true);
    try {
      await updateGeneration(generationId, {
        title: result.projectName,
        summary: result.overview,
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
  const updateTrade = (tradeId, field, value) =>
    updateResult((r) => ({ ...r, trades: r.trades.map((t) => t.id === tradeId ? { ...t, [field]: value } : t) }));
  const updateLineItem = (tradeId, idx, field, value) =>
    updateResult((r) => ({ ...r, trades: r.trades.map((t) => t.id === tradeId
      ? { ...t, lineItems: t.lineItems.map((li, i) => i === idx ? { ...li, [field]: value } : li) }
      : t) }));
  const deleteLineItem = (tradeId, idx) =>
    updateResult((r) => ({ ...r, trades: r.trades.map((t) => t.id === tradeId
      ? { ...t, lineItems: t.lineItems.filter((_, i) => i !== idx) }
      : t) }));
  const addLineItem = (tradeId) =>
    updateResult((r) => ({ ...r, trades: r.trades.map((t) => t.id === tradeId
      ? { ...t, lineItems: [...(t.lineItems || []), { description: "", note: null }] }
      : t) }));
  const updateNote = (field, idx, value) =>
    updateResult((r) => ({ ...r, [field]: (r[field] || []).map((x, i) => i === idx ? value : x) }));
  const deleteNote = (field, idx) =>
    updateResult((r) => ({ ...r, [field]: (r[field] || []).filter((_, i) => i !== idx) }));
  const addNote = (field) =>
    updateResult((r) => ({ ...r, [field]: [...(r[field] || []), ""] }));
  const updateOverview = (value) => updateResult((r) => ({ ...r, overview: value }));

  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const toEmailHtml = (r, clientName, branding = {}) => {
    const { hasLogo, logoCid, companyName } = branding;
    const tradeBlocks = r.trades.map((t, i) => `
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
          ${listSection("General Conditions", r.generalConditions)}
          ${listSection("Exclusions", r.exclusions)}
          ${listSection("Clarifications", r.clarifications)}
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
              </div>
              <div className="trade-body">
                <textarea
                  className="edit-textarea"
                  style={{ fontSize: 13, lineHeight: 1.7, color: "#1a1f2e", marginBottom: 12 }}
                  value={t.scopeText}
                  onChange={(e) => updateTrade(t.id, "scopeText", e.target.value)}
                />
                <div className="line-items">
                  {t.lineItems.map((li, i) => (
                    <div key={i} className="line-item editable-row">
                      <span className="line-bullet">▸</span>
                      <div className="edit-body">
                        <input
                          className="edit-input"
                          style={{ fontSize: 13 }}
                          value={li.description}
                          onChange={(e) => updateLineItem(t.id, i, "description", e.target.value)}
                          placeholder="Line item description"
                        />
                        <input
                          className="edit-input"
                          style={{ fontSize: 11, fontStyle: "italic", color: "#909ab0" }}
                          value={li.note || ""}
                          onChange={(e) => updateLineItem(t.id, i, "note", e.target.value || null)}
                          placeholder="Optional note"
                        />
                      </div>
                      <button
                        type="button"
                        className="delete-icon-btn"
                        title="Delete line"
                        onClick={() => deleteLineItem(t.id, i)}
                      >🗑</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="add-line-btn" onClick={() => addLineItem(t.id)}>＋ Add Line</button>
              </div>
            </div>
          ))}

          {renderNotesSection("General Conditions", "generalConditions", result.generalConditions, { topMargin: 22, updateNote, deleteNote, addNote })}
          {renderNotesSection("Exclusions", "exclusions", result.exclusions, { updateNote, deleteNote, addNote })}
          {renderNotesSection("Clarifications", "clarifications", result.clarifications, { updateNote, deleteNote, addNote })}

          <div className="result-actions" style={{ marginTop: 24 }}>
            <button className="btn btn-primary" onClick={() => downloadTxt(`${result.projectName.replace(/\s+/g, "_")}_Scope.txt`, toText(result))}>⬇ Download Scope</button>
            <button className="btn" style={{ borderColor: "rgba(39,174,96,0.3)", color: "#27ae60" }} onClick={() => setSendOpen(true)}>✉ Send to Client</button>
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
          {list.map((val, i) => (
            <div key={i} className="notes-item editable-row" style={{ display: "flex" }}>
              <div className="edit-body" style={{ flex: 1 }}>
                <input
                  className="edit-input"
                  value={val}
                  onChange={(e) => updateNote(field, i, e.target.value)}
                  placeholder={`${title.slice(0, -1)}…`}
                />
              </div>
              <button
                type="button"
                className="delete-icon-btn"
                title="Delete"
                onClick={() => deleteNote(field, i)}
              >🗑</button>
            </div>
          ))}
        </div>
        <button type="button" className="add-line-btn" onClick={() => addNote(field)}>＋ Add Line</button>
      </div>
    </>
  );
}
