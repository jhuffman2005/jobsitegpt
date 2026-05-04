import { useState, useEffect, useRef } from "react";
import { useToast } from "../lib/hooks";
import {
  uploadSmartLogPhoto,
  saveSmartLog,
  updateSmartLog,
  getUserSettings,
} from "../lib/projects";
import { ProcessingSteps } from "../components/SharedComponents";
import ProjectSwitcher from "../components/ProjectSwitcher";

const STEPS = [
  "Pulling weather…",
  "Reading prior log entries…",
  "Drafting today's log…",
  "Polishing…",
];

const QUICK_CHECKS = [
  { key: "deliveries", icon: "🚚", label: "Deliveries received today?" },
  { key: "visitors", icon: "👷", label: "Visitors on site?" },
  { key: "safety", icon: "⚠️", label: "Safety incidents?" },
  { key: "inspections", icon: "🔍", label: "Inspections?" },
];

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fmtLogDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export default function SmartLog({ activeProject, onProjectChange }) {
  const fileInputRef = useRef(null);
  const [logDate, setLogDate] = useState(todayISO());
  const [rawNotes, setRawNotes] = useState("");
  const [quickChecks, setQuickChecks] = useState({
    deliveries: { open: false, text: "" },
    visitors: { open: false, text: "" },
    safety: { open: false, text: "" },
    inspections: { open: false, text: "" },
  });
  // photos: [{ name, status: 'uploading'|'done'|'error', url, previewUrl }]
  const [photos, setPhotos] = useState([]);
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null); // { generated_log, weather, smart_log_id }
  const [editedLog, setEditedLog] = useState("");
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    getUserSettings().then((s) => {
      if (s?.company_name) setCompanyName(s.company_name);
    }).catch(() => {});
  }, []);

  // Reset form when project changes
  const prevProjectIdRef = useRef(activeProject?.id);
  useEffect(() => {
    if (activeProject?.id === prevProjectIdRef.current) return;
    prevProjectIdRef.current = activeProject?.id;
    setStatus("idle");
    setResult(null);
    setEditedLog("");
    setRawNotes("");
    setPhotos([]);
    setQuickChecks({
      deliveries: { open: false, text: "" },
      visitors: { open: false, text: "" },
      safety: { open: false, text: "" },
      inspections: { open: false, text: "" },
    });
  }, [activeProject?.id]);

  const toggleQc = (key) =>
    setQuickChecks((qc) => ({ ...qc, [key]: { ...qc[key], open: !qc[key].open } }));

  const setQcText = (key, text) =>
    setQuickChecks((qc) => ({ ...qc, [key]: { ...qc[key], text } }));

  const collapseQc = (key) =>
    setQuickChecks((qc) => ({ ...qc, [key]: { open: false, text: "" } }));

  const handlePhotoUpload = async (fileList) => {
    if (!activeProject?.id) {
      showToast("Pick a project first");
      return;
    }
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;

    // Add placeholder rows immediately with local previews
    const placeholders = files.map((f) => ({
      name: f.name,
      status: "uploading",
      url: null,
      previewUrl: URL.createObjectURL(f),
    }));
    setPhotos((prev) => [...prev, ...placeholders]);

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const placeholderName = placeholders[i].name;
      try {
        const url = await uploadSmartLogPhoto(activeProject.id, logDate, f);
        setPhotos((prev) =>
          prev.map((p) =>
            p.name === placeholderName && p.status === "uploading"
              ? { ...p, status: "done", url }
              : p
          )
        );
      } catch (e) {
        console.error("Photo upload failed:", e);
        setPhotos((prev) =>
          prev.map((p) =>
            p.name === placeholderName && p.status === "uploading"
              ? { ...p, status: "error" }
              : p
          )
        );
        showToast(`Upload failed: ${f.name}`);
      }
    }
  };

  const removePhoto = (name) => {
    setPhotos((prev) => prev.filter((p) => p.name !== name));
  };

  const generate = async () => {
    if (!activeProject?.id) {
      setError("Select a project first.");
      return;
    }
    if (!rawNotes.trim()) {
      setError("Add some notes about today before generating.");
      return;
    }
    if (photos.some((p) => p.status === "uploading")) {
      setError("Wait for all photos to finish uploading.");
      return;
    }

    setStatus("loading");
    setStepIdx(0);
    setError("");
    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1500));

    try {
      const res = await fetch("/api/smartlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: activeProject.id,
          project_name: activeProject.name,
          project_location: activeProject.address || "",
          log_date: logDate,
          raw_notes: rawNotes,
          deliveries: quickChecks.deliveries.text,
          visitors: quickChecks.visitors.text,
          safety: quickChecks.safety.text,
          inspections: quickChecks.inspections.text,
        }),
      });
      const data = await res.json();
      timers.forEach(clearTimeout);
      if (!res.ok) throw new Error(data.error || "Generation failed");

      // Persist the log row
      const photoUrls = photos.filter((p) => p.url).map((p) => p.url);
      const row = await saveSmartLog({
        project_id: activeProject.id,
        log_date: logDate,
        raw_notes: rawNotes,
        deliveries: quickChecks.deliveries.text || null,
        visitors: quickChecks.visitors.text || null,
        safety: quickChecks.safety.text || null,
        inspections: quickChecks.inspections.text || null,
        weather: data.weather || null,
        generated_log: data.generated_log,
        photos: photoUrls,
      });

      setResult({
        generated_log: data.generated_log,
        weather: data.weather,
        smart_log_id: row.id,
        photos: photoUrls,
      });
      setEditedLog(data.generated_log);
      setStatus("done");

      // If auto-send is enabled on the project, fire it off
      if (activeProject.smartlog_auto_send) {
        const recipient =
          activeProject.smartlog_client_email || activeProject.client_email;
        if (recipient) sendToClient(data.generated_log, data.weather, photoUrls, row.id, recipient, true);
      }
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e.message);
      setStatus("error");
    }
  };

  const saveEdits = async () => {
    if (!result?.smart_log_id) return;
    setSaving(true);
    try {
      await updateSmartLog(result.smart_log_id, { generated_log: editedLog });
      setResult((r) => ({ ...r, generated_log: editedLog }));
      showToast("Saved");
    } catch (e) {
      showToast(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const buildEmailHtml = (logText, weather, photoUrls) => {
    const projectName = activeProject?.name || "Project";
    const escape = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const fromName = companyName || "JobSiteGPT";
    const photoBlock = photoUrls?.length
      ? `<div style="margin-top: 20px;">
          <div style="font-size: 12px; color: #909ab0; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">Photos from today</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
            ${photoUrls.map((u) => `<img src="${escape(u)}" alt="Site photo" style="width: 100%; border-radius: 6px; border: 1px solid #e0e4ef;" />`).join("")}
          </div>
        </div>`
      : "";

    return `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1f2e; padding: 20px; border-radius: 8px 8px 0 0;">
          <div style="color: #f0a500; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px;">Daily Log</div>
          <div style="color: #ffffff; font-size: 22px; font-weight: bold;">${escape(projectName)}</div>
          <div style="color: #909ab0; font-size: 13px; margin-top: 4px;">
            ${escape(fmtLogDate(logDate))}${weather ? ` · ${escape(weather)}` : ""}
          </div>
        </div>
        <div style="background: #ffffff; padding: 24px; border: 1px solid #e0e4ef;">
          <div style="font-size: 14px; color: #1a1f2e; line-height: 1.7; white-space: pre-wrap;">${escape(logText)}</div>
          ${photoBlock}
        </div>
        <div style="background: #f0f2f5; padding: 14px 20px; border-radius: 0 0 8px 8px; text-align: center;">
          <div style="font-size: 12px; color: #909ab0;">Sent via JobSiteGPT · SmartLog</div>
        </div>
      </div>
    `;
  };

  const sendToClient = async (
    logText = editedLog,
    weather = result?.weather,
    photoUrls = result?.photos || [],
    smartLogId = result?.smart_log_id,
    overrideEmail = null,
    silent = false,
  ) => {
    const recipient =
      overrideEmail ||
      activeProject?.smartlog_client_email ||
      activeProject?.client_email;
    if (!recipient) {
      if (!silent) showToast("Add a client email to the project first");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          subject: `Daily Log — ${activeProject?.name || "Project"} — ${fmtLogDate(logDate)}`,
          html: buildEmailHtml(logText, weather, photoUrls),
          from_name: companyName || "JobSiteGPT",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email failed");
      if (smartLogId) {
        try { await updateSmartLog(smartLogId, { sent_to_client: true }); } catch {}
      }
      setResult((r) => (r ? { ...r, sent_to_client: true } : r));
      if (!silent) showToast("Sent to client!");
    } catch (e) {
      if (!silent) showToast(`Send failed: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const newLog = () => {
    setStatus("idle");
    setResult(null);
    setEditedLog("");
    setRawNotes("");
    setPhotos([]);
    setLogDate(todayISO());
    setQuickChecks({
      deliveries: { open: false, text: "" },
      visitors: { open: false, text: "" },
      safety: { open: false, text: "" },
      inspections: { open: false, text: "" },
    });
    setError("");
  };

  return (
    <div className="fade-up">
      <ProjectSwitcher activeProject={activeProject} onProjectChange={onProjectChange} />

      {(status === "idle" || status === "error") && (
        <>
          <div className="section-label">Log Date</div>
          <div className="input-group">
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              max={todayISO()}
              style={{ maxWidth: 240 }}
            />
          </div>

          <div className="section-label">Photos</div>
          <div className="input-group">
            <div
              className="upload-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag"); }}
              onDragLeave={(e) => e.currentTarget.classList.remove("drag")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("drag");
                handlePhotoUpload(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={(e) => handlePhotoUpload(e.target.files)}
                onClick={(e) => e.stopPropagation()}
              />
              <div style={{ fontSize: 26, marginBottom: 8 }}>📷</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: "#6b7599" }}>
                Tap to add jobsite photos
              </div>
              <div style={{ fontSize: 11, color: "#909ab0", marginTop: 5 }}>
                JPG · PNG — captured straight from your phone camera
              </div>
            </div>

            {photos.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginTop: 14 }}>
                {photos.map((p) => (
                  <div key={p.name} style={{ position: "relative", aspectRatio: "1", borderRadius: 6, overflow: "hidden", border: "1.5px solid #e0e4ef", background: "#f8f9fc" }}>
                    {p.previewUrl && (
                      <img src={p.previewUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: p.status === "uploading" ? 0.5 : 1 }} />
                    )}
                    {p.status === "uploading" && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "'Inter',sans-serif", color: "#606880", background: "rgba(255,255,255,0.6)" }}>
                        Uploading…
                      </div>
                    )}
                    {p.status === "error" && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "'Inter',sans-serif", color: "#e74c3c", background: "rgba(231,76,60,0.1)" }}>
                        Failed
                      </div>
                    )}
                    <button
                      onClick={() => removePhoto(p.name)}
                      style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, padding: 0, background: "rgba(26,31,46,0.7)", color: "#fff", border: "none", borderRadius: "50%", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      aria-label="Remove photo"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section-label">Notes</div>
          <div className="input-group">
            <label className="field-label">What happened on site today?</label>
            <textarea
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="Describe the day — crew, progress, issues, anything notable"
              rows={6}
              style={{ minHeight: 140 }}
            />
            <div style={{ fontSize: 11, color: "#909ab0", marginTop: 6, fontFamily: "'Inter',sans-serif" }}>
              Tip: tap your keyboard's mic icon to dictate.
            </div>
          </div>

          <div className="section-label">Quick Checks</div>
          <div style={{ background: "#ffffff", border: "1.5px solid #e0e4ef", borderRadius: 8, marginBottom: 22, overflow: "hidden" }}>
            {QUICK_CHECKS.map((qc, i) => {
              const state = quickChecks[qc.key];
              const hasContent = state.text.trim().length > 0;
              const isLast = i === QUICK_CHECKS.length - 1;
              return (
                <div key={qc.key} style={{ borderBottom: isLast ? "none" : "1px solid #f0f2f5" }}>
                  {!state.open ? (
                    <div
                      onClick={() => toggleQc(qc.key)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{qc.icon}</span>
                      <span style={{ flex: 1, fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#1a1f2e", fontWeight: 500 }}>
                        {qc.label}
                      </span>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: hasContent ? "#c47f00" : "#909ab0", fontStyle: hasContent ? "normal" : "italic" }}>
                        {hasContent ? state.text.length > 28 ? state.text.slice(0, 28) + "…" : state.text : "None today"}
                      </span>
                      <span style={{ fontSize: 18, color: "#c0c8d8", width: 18, textAlign: "center" }}>＋</span>
                    </div>
                  ) : (
                    <div style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{qc.icon}</span>
                        <span style={{ flex: 1, fontFamily: "'Inter',sans-serif", fontSize: 14, color: "#1a1f2e", fontWeight: 500 }}>
                          {qc.label}
                        </span>
                        <button
                          onClick={() => collapseQc(qc.key)}
                          className="btn btn-ghost"
                          style={{ padding: "3px 8px", fontSize: 10, letterSpacing: "0.06em" }}
                        >
                          Clear
                        </button>
                      </div>
                      <textarea
                        value={state.text}
                        onChange={(e) => setQcText(qc.key, e.target.value)}
                        placeholder={`Details for ${qc.label.toLowerCase().replace("?", "")}…`}
                        rows={3}
                        autoFocus
                        style={{ minHeight: 70, fontSize: 13 }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && <div className="error-box" style={{ marginBottom: 14 }}>⚠ {error}</div>}

          <button
            className="btn btn-primary btn-lg"
            disabled={!activeProject?.id || !rawNotes.trim()}
            onClick={generate}
          >
            📓 Generate Log
          </button>
          {!activeProject?.id && (
            <div style={{ fontSize: 12, color: "#909ab0", marginTop: 10, textAlign: "center" }}>
              Pick a project at the top to start logging.
            </div>
          )}
        </>
      )}

      {status === "loading" && <ProcessingSteps steps={STEPS} idx={stepIdx} hint="Pulling weather and prior logs, then writing." />}

      {status === "done" && result && (
        <>
          <div className="result-header-card">
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#909ab0", marginBottom: 4 }}>
              DAILY LOG · {fmtLogDate(logDate).toUpperCase()}
            </div>
            <div className="result-title">{activeProject?.name}</div>
            <div className="result-meta" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {result.weather && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(74,144,226,0.08)", color: "#4a90e2", border: "1px solid rgba(74,144,226,0.2)", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontFamily: "'Inter',sans-serif" }}>
                  ☀ {result.weather}
                </span>
              )}
              {result.photos?.length > 0 && (
                <span style={{ fontSize: 11, color: "#909ab0" }}>{result.photos.length} photo{result.photos.length === 1 ? "" : "s"}</span>
              )}
              {result.sent_to_client && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#27ae60", fontSize: 11, fontFamily: "'Inter',sans-serif" }}>
                  ✓ Sent to client
                </span>
              )}
            </div>
            <div className="result-actions">
              <button className="btn btn-primary" disabled={saving} onClick={saveEdits}>
                {saving ? "Saving…" : "💾 Save Log"}
              </button>
              <button
                className="btn"
                disabled={sending || (!activeProject?.client_email && !activeProject?.smartlog_client_email)}
                onClick={() => sendToClient()}
              >
                {sending ? "Sending…" : "✉ Send to Client"}
              </button>
              <button className="btn btn-ghost" onClick={newLog}>↩ New Log</button>
            </div>
          </div>

          <div className="section-label">Generated Log</div>
          <div className="input-group">
            <textarea
              value={editedLog}
              onChange={(e) => setEditedLog(e.target.value)}
              style={{ minHeight: 360, lineHeight: 1.7, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: "#909ab0", marginTop: 6, fontFamily: "'Inter',sans-serif" }}>
              Edit anything you'd like to fix, then hit Save Log.
            </div>
          </div>

          {result.photos?.length > 0 && (
            <>
              <div className="section-label">Photos</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 22 }}>
                {result.photos.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ display: "block", aspectRatio: "1", borderRadius: 6, overflow: "hidden", border: "1.5px solid #e0e4ef" }}>
                    <img src={u} alt="Site photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </a>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
