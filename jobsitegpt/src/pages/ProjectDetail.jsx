import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getProject, updateProject,
  getProjectFiles, uploadProjectFile,
  deleteProjectFile, getProjectFileUrl,
  getGenerations,
} from "../lib/projects";

// ── Generation export helpers ─────────────────────────────────────────────────

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildGenHtml(tool, title, data) {
  const date = new Date().toLocaleDateString();
  let body = "";

  if (tool === "ScopeGPT" && data?.trades) {
    body = `<h1>Scope of Work</h1>
      <p><strong>${data.projectName || title}</strong>${data.projectType ? ` · ${data.projectType}` : ""}${data.estimatedDuration ? ` · ${data.estimatedDuration}` : ""}</p>
      <p>${data.overview || ""}</p>
      <h2>Scope by Trade</h2>
      ${(data.trades || []).map(t => `
        <h3>${t.tradeName} <span style="font-weight:400;font-size:12px;color:#909ab0">[${t.contractor}]</span></h3>
        <p>${t.scopeText}</p>
        <ul>${(t.lineItems || []).map(li => `<li>${li.description}${li.note ? ` <em>(${li.note})</em>` : ""}</li>`).join("")}</ul>
      `).join("")}
      ${data.generalConditions?.length ? `<h2>General Conditions</h2><ul>${data.generalConditions.map(g => `<li>${g}</li>`).join("")}</ul>` : ""}
      ${data.exclusions?.length ? `<h2>Exclusions</h2><ul>${data.exclusions.map(e => `<li>${e}</li>`).join("")}</ul>` : ""}
      ${data.clarifications?.length ? `<h2>Clarifications</h2><ul>${data.clarifications.map(c => `<li>${c}</li>`).join("")}</ul>` : ""}`;
  } else if (tool === "ScheduleGPT" && data?.tasks) {
    body = `<h1>Project Schedule</h1>
      <p><strong>${data.projectName || title}</strong> · ${data.totalDays} days · Phases: ${(data.phases || []).join(", ")}</p>
      <h2>Task Schedule</h2>
      <table><thead><tr><th>#</th><th>Task</th><th>Phase</th><th>Trade</th><th>Start</th><th>Days</th></tr></thead>
      <tbody>${(data.tasks || []).map(t => `<tr><td>${t.id}</td><td>${t.task}</td><td>${t.phase}</td><td>${t.trade}</td><td>Day ${t.startDay}</td><td>${t.durationDays}d</td></tr>`).join("")}</tbody></table>
      <h2>Subcontractor Worksheet</h2>
      <table><thead><tr><th>Trade</th><th>Phase</th><th>Est. Days</th><th>Sub Types</th><th>Scope</th></tr></thead>
      <tbody>${(data.subcontractors || []).map(s => `<tr><td>${s.trade}</td><td>${s.phase}</td><td>${s.estimatedDays}d</td><td>${(s.recommendedSubTypes || []).join(", ")}</td><td>${s.scope}</td></tr>`).join("")}</tbody></table>`;
  } else if (tool === "ChangeOrderGPT" && data?.lineItems) {
    body = `<h1>Change Order #${data.changeOrderNumber || ""}</h1>
      <p><strong>${data.title || title}</strong><br>${data.projectName || ""} · ${data.clientName || ""} · ${data.date || ""}</p>
      <p>${data.description || ""}</p>
      <p><strong>Reason:</strong> ${data.reason || ""}</p>
      <h2>Cost Breakdown</h2>
      <table><thead><tr><th>Description</th><th>Trade</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>${(data.lineItems || []).map(li => `<tr><td>${li.description}</td><td>${li.trade}</td><td>${li.quantity} ${li.unit}</td><td>${fmtMoney(li.unitPrice)}</td><td>${fmtMoney(li.totalPrice)}</td></tr>`).join("")}</tbody></table>
      <p>Subtotal: ${fmtMoney(data.subtotal)} · Overhead: ${fmtMoney(data.overhead)} · Profit: ${fmtMoney(data.profit)}</p>
      <p class="total">TOTAL: ${fmtMoney(data.totalAmount)}</p>
      <p>Schedule Impact: +${data.daysAdded} days</p>
      ${data.contractLanguage ? `<h2>Contract Language</h2><p style="font-style:italic">${data.contractLanguage}</p>` : ""}`;
  } else {
    body = `<h1>${title}</h1><pre>${JSON.stringify(data, null, 2)}</pre>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,sans-serif;max-width:820px;margin:0 auto;padding:28px;color:#1a1f2e;font-size:14px}
    h1{font-size:22px;font-weight:700;border-bottom:3px solid #f0a500;padding-bottom:8px;margin-bottom:16px}
    h2{font-size:12px;font-weight:700;color:#f0a500;text-transform:uppercase;letter-spacing:0.12em;margin:24px 0 8px}
    h3{font-size:14px;font-weight:600;margin:14px 0 4px}
    p{font-size:13px;line-height:1.6;color:#606880;margin:4px 0 10px}
    ul{margin:4px 0 12px;padding-left:20px}li{font-size:13px;color:#606880;margin-bottom:3px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
    th{background:#1a1f2e;color:#fff;padding:8px 10px;text-align:left;font-size:11px}
    td{padding:7px 10px;border-bottom:1px solid #e0e4ef;vertical-align:top}
    .total{font-size:16px;font-weight:700;color:#c47f00}
    pre{font-size:11px;background:#f5f7fa;padding:16px;border-radius:6px;overflow:auto;white-space:pre-wrap;word-break:break-word}
    .footer{margin-top:36px;font-size:10px;color:#bbb;text-align:center;border-top:1px solid #e0e4ef;padding-top:12px}
    @media print{body{padding:8px}.no-print{display:none}}
  </style></head><body>${body}<div class="footer">Generated by JobSiteGPT · ${date}</div></body></html>`;
}

function GenInlineView({ tool, data }) {
  if (!data) return null;

  if (tool === "ScopeGPT" && data.trades) {
    return (
      <div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1a1f2e", marginBottom: 12 }}>{data.overview}</div>
        {(data.trades || []).map((t, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1f2e", marginBottom: 2 }}>
              {t.tradeName} <span style={{ color: "#909ab0", fontWeight: 400 }}>[{t.contractor}]</span>
            </div>
            <div style={{ fontSize: 12, color: "#606880", marginBottom: 4 }}>{t.scopeText}</div>
            {t.lineItems?.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {t.lineItems.map((li, j) => (
                  <li key={j} style={{ fontSize: 11, color: "#606880", marginBottom: 2 }}>
                    {li.description}{li.note && <em style={{ color: "#909ab0" }}> — {li.note}</em>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {data.generalConditions?.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: "#f0a500", textTransform: "uppercase", letterSpacing: "0.1em", margin: "12px 0 6px" }}>General Conditions</div><ul style={{ margin: 0, paddingLeft: 18 }}>{data.generalConditions.map((g, i) => <li key={i} style={{ fontSize: 11, color: "#606880" }}>{g}</li>)}</ul></>}
        {data.exclusions?.length > 0 && <><div style={{ fontSize: 11, fontWeight: 700, color: "#f0a500", textTransform: "uppercase", letterSpacing: "0.1em", margin: "12px 0 6px" }}>Exclusions</div><ul style={{ margin: 0, paddingLeft: 18 }}>{data.exclusions.map((e, i) => <li key={i} style={{ fontSize: 11, color: "#606880" }}>{e}</li>)}</ul></>}
      </div>
    );
  }

  if (tool === "ScheduleGPT" && data.tasks) {
    return (
      <div>
        <div style={{ fontSize: 12, color: "#606880", marginBottom: 10 }}>{data.totalDays} days · {(data.phases || []).join(" → ")}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr style={{ background: "#1a1f2e" }}>
              {["#", "Task", "Phase", "Trade", "Start", "Days"].map(h => <th key={h} style={{ padding: "6px 8px", color: "#fff", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(data.tasks || []).map(t => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f0f2f5" }}>
                  <td style={{ padding: "5px 8px", color: "#c0c8d8" }}>{t.id}</td>
                  <td style={{ padding: "5px 8px", fontWeight: 600 }}>{t.task}</td>
                  <td style={{ padding: "5px 8px", color: "#606880" }}>{t.phase}</td>
                  <td style={{ padding: "5px 8px", color: "#606880" }}>{t.trade}</td>
                  <td style={{ padding: "5px 8px", color: "#909ab0" }}>Day {t.startDay}</td>
                  <td style={{ padding: "5px 8px", color: "#909ab0" }}>{t.durationDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tool === "ChangeOrderGPT" && data.lineItems) {
    return (
      <div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1a1f2e", marginBottom: 8 }}>{data.description}</div>
        <div style={{ fontSize: 12, color: "#606880", marginBottom: 12 }}><strong>Reason:</strong> {data.reason}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 8 }}>
          <thead><tr style={{ background: "#1a1f2e" }}>
            {["Description", "Trade", "Qty", "Unit Price", "Total"].map(h => <th key={h} style={{ padding: "6px 8px", color: "#fff", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {(data.lineItems || []).map((li, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f0f2f5" }}>
                <td style={{ padding: "5px 8px" }}>{li.description}</td>
                <td style={{ padding: "5px 8px", color: "#606880" }}>{li.trade}</td>
                <td style={{ padding: "5px 8px", color: "#606880" }}>{li.quantity} {li.unit}</td>
                <td style={{ padding: "5px 8px", color: "#606880" }}>{fmtMoney(li.unitPrice)}</td>
                <td style={{ padding: "5px 8px", fontWeight: 600, color: "#c47f00" }}>{fmtMoney(li.totalPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #f0a500" }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>TOTAL</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#c47f00" }}>{fmtMoney(data.totalAmount)}</span>
        </div>
        <div style={{ fontSize: 11, color: "#909ab0", marginTop: 4 }}>Schedule Impact: +{data.daysAdded} days</div>
      </div>
    );
  }

  // Generic fallback
  return (
    <pre style={{ fontSize: 11, color: "#606880", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function ProjectDetail({ onProjectLoad }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [generations, setGenerations] = useState([]);
  const [expandedGen, setExpandedGen] = useState(null);
  const [viewingGenId, setViewingGenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: "", client_name: "", client_email: "",
    client_phone: "", address: "", contract_type: "fixed_price",
    markup_percent: 0, notes: ""
  });

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    try {
      setLoading(true);
      const [p, f, g] = await Promise.all([getProject(id), getProjectFiles(id), getGenerations(id)]);
      setProject(p);
      setFiles(f);
      setGenerations(g);
      setForm({
        name: p.name || "",
        client_name: p.client_name || "",
        client_email: p.client_email || "",
        client_phone: p.client_phone || "",
        address: p.address || "",
        contract_type: p.contract_type || "fixed_price",
        markup_percent: p.markup_percent || 0,
        notes: p.notes || "",
      });
      if (onProjectLoad) onProjectLoad(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const updated = await updateProject(id, form);
      setProject(updated);
      if (onProjectLoad) onProjectLoad(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleUpload = async (newFiles) => {
    setUploading(true); setError("");
    try {
      const valid = Array.from(newFiles).filter(
        f => f.type === "application/pdf" || f.type.startsWith("image/")
      );
      for (const f of valid) {
        const record = await uploadProjectFile(id, f);
        setFiles(prev => [record, ...prev]);
      }
    } catch (e) { setError(e.message); }
    finally { setUploading(false); }
  };

  const handleDeleteFile = async (fileId, storagePath) => {
    if (!confirm("Remove this file?")) return;
    try {
      await deleteProjectFile(fileId, storagePath);
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (e) { setError(e.message); }
  };

  const handleViewFile = async (storagePath, fileName) => {
    try {
      const url = await getProjectFileUrl(storagePath);
      window.open(url, "_blank");
    } catch (e) { setError(e.message); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fmtSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const exportGenPdf = (tool, title, data) => {
    const html = buildGenHtml(tool, title, data);
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
  };

  const exportGenHtml = (tool, title, data) => {
    const html = buildGenHtml(tool, title, data);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `${(title || tool).replace(/\s+/g, "_")}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) return <div style={{ color: "#6b7599", fontFamily: "'Inter',sans-serif", fontSize: 13 }}>Loading project…</div>;

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "0.04em", marginBottom: 4 }}>{project?.name}</div>
          <div style={{ fontSize: 12, color: "#6b7599", fontFamily: "'Inter',sans-serif", cursor: "pointer" }} onClick={() => navigate("/projects")}>← All Projects</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saved && <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#27ae60" }}>✓ Saved</span>}
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Project Details */}
      <div className="section-label">Project Details</div>
      <div className="row-2 input-group">
        <div><label className="field-label">Project Name *</label><input type="text" value={form.name} onChange={e => set("name", e.target.value)} /></div>
        <div><label className="field-label">Job Address</label><input type="text" placeholder="123 Main St, City, State" value={form.address} onChange={e => set("address", e.target.value)} /></div>
      </div>

      <div className="section-label">Client Info</div>
      <div className="row-3 input-group">
        <div><label className="field-label">Client Name</label><input type="text" placeholder="Johnson Family" value={form.client_name} onChange={e => set("client_name", e.target.value)} /></div>
        <div><label className="field-label">Client Email</label><input type="email" placeholder="client@email.com" value={form.client_email} onChange={e => set("client_email", e.target.value)} /></div>
        <div><label className="field-label">Client Phone</label><input type="text" placeholder="(555) 555-5555" value={form.client_phone} onChange={e => set("client_phone", e.target.value)} /></div>
      </div>

      <div className="section-label">Contract</div>
      <div className="row-2 input-group">
        <div>
          <label className="field-label">Contract Type</label>
          <select value={form.contract_type} onChange={e => set("contract_type", e.target.value)}>
            <option value="fixed_price">Fixed Price</option>
            <option value="cost_plus">Cost Plus</option>
            <option value="time_and_materials">Time & Materials</option>
          </select>
        </div>
        {form.contract_type !== "fixed_price" && (
          <div><label className="field-label">Markup %</label><input type="number" min="0" max="100" value={form.markup_percent} onChange={e => set("markup_percent", e.target.value)} /></div>
        )}
      </div>

      <div className="input-group">
        <label className="field-label">Project Notes</label>
        <textarea placeholder="Any additional context for this project…" value={form.notes} onChange={e => set("notes", e.target.value)} style={{ minHeight: 80 }} />
      </div>

      {error && <div className="error-box">{error}</div>}

      <button className="btn btn-primary btn-lg" disabled={saving} onClick={handleSave} style={{ marginBottom: 36 }}>
        {saving ? "Saving…" : "Save Project"}
      </button>

      {/* File Repository */}
      <div className="section-label">Project Files</div>
      <div style={{ background: "#131720", border: "1px solid #252d42", padding: "18px 22px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "#6b7599", marginBottom: 16 }}>
          Upload plans, permits, specs, or photos once — available to all tools for this project.
        </div>

        <div
          className="upload-zone"
          style={{ marginBottom: 16, position: "relative" }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
          onDragLeave={e => { e.currentTarget.classList.remove("drag-over"); }}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("drag-over"); handleUpload(e.dataTransfer.files); }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,image/*"
            style={{ position: "absolute", opacity: 0, top: 0, left: 0, width: "100%", height: "100%", cursor: "pointer" }}
            onChange={e => handleUpload(e.target.files)}
          />
          <div style={{ fontSize: 24, marginBottom: 8 }}>📎</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 14, color: "#6b7599" }}>
            {uploading ? "Uploading…" : "Drop files or click to upload"}
          </div>
          <div style={{ fontSize: 11, color: "#3a4260", fontFamily: "'Inter',sans-serif", marginTop: 5 }}>
            PDF · JPG · PNG — plans, permits, specs, photos
          </div>
        </div>

        {files.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px 0", color: "#3a4260", fontSize: 13 }}>No files uploaded yet.</div>
        ) : (
          files.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #252d42" }}>
              <div style={{ fontSize: 16 }}>{f.file_type?.startsWith("image/") ? "🖼" : "📄"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.file_name}</div>
                <div style={{ fontSize: 11, color: "#6b7599", fontFamily: "'Inter',sans-serif" }}>
                  {fmtSize(f.file_size)} · {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              <button className="btn" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => handleViewFile(f.storage_path, f.file_name)}>View</button>
              <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => handleDeleteFile(f.id, f.storage_path)}>✕</button>
            </div>
          ))
        )}
      </div>

      {/* Generation History */}
      {generations.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 32 }}>Generation History</div>
          {(() => {
            const TOOL_ORDER = ["ScopeGPT", "ScheduleGPT", "ChangeOrderGPT", "BidMatch", "FieldLedger"];
            const TOOL_ICONS = { ScopeGPT: "📋", ScheduleGPT: "📅", ChangeOrderGPT: "✏", BidMatch: "⚖", FieldLedger: "📒" };
            const grouped = {};
            generations.forEach((g) => {
              if (!grouped[g.tool]) grouped[g.tool] = [];
              grouped[g.tool].push(g);
            });
            return TOOL_ORDER.filter((t) => grouped[t]).map((tool) => (
              <div key={tool} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>{TOOL_ICONS[tool]}</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>{tool}</span>
                  <span style={{ fontSize: 11, color: "#909ab0", fontFamily: "'Inter',sans-serif" }}>({grouped[tool].length})</span>
                </div>
                {grouped[tool].map((g) => (
                  <div key={g.id} style={{ background: "#ffffff", border: "1px solid #e0e4ef", borderRadius: 6, marginBottom: 8 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
                      onClick={() => {
                        const next = expandedGen === g.id ? null : g.id;
                        setExpandedGen(next);
                        if (!next) setViewingGenId(null);
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1f2e" }}>{g.title}</div>
                        <div style={{ fontSize: 11, color: "#909ab0", fontFamily: "'Inter',sans-serif", marginTop: 2 }}>
                          {new Date(g.created_at).toLocaleDateString()} · {new Date(g.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "#c0c8d8" }}>{expandedGen === g.id ? "▲" : "▼"}</span>
                    </div>
                    {expandedGen === g.id && (
                      <div style={{ padding: "0 16px 14px", borderTop: "1px solid #f0f2f5" }}>
                        <div style={{ fontSize: 12, color: "#606880", lineHeight: 1.6, marginTop: 10, marginBottom: g.result_data ? 12 : 0 }}>{g.summary}</div>

                        {/* Inline view panel */}
                        {viewingGenId === g.id && g.result_data && (
                          <div style={{ background: "#f8f9fc", border: "1px solid #e0e4ef", borderRadius: 6, padding: "14px 16px", marginBottom: 12, maxHeight: 420, overflowY: "auto" }}>
                            <GenInlineView tool={tool} data={g.result_data} />
                          </div>
                        )}

                        {g.result_data && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              className="btn"
                              style={{ padding: "5px 12px", fontSize: 11 }}
                              onClick={() => setViewingGenId(viewingGenId === g.id ? null : g.id)}
                            >
                              {viewingGenId === g.id ? "▲ Collapse" : "▼ View"}
                            </button>
                            <button
                              className="btn btn-primary"
                              style={{ padding: "5px 12px", fontSize: 11 }}
                              onClick={() => exportGenPdf(tool, g.title, g.result_data)}
                            >
                              ⎙ PDF
                            </button>
                            <button
                              className="btn"
                              style={{ padding: "5px 12px", fontSize: 11 }}
                              onClick={() => exportGenHtml(tool, g.title, g.result_data)}
                            >
                              ⬇ HTML
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: "5px 12px", fontSize: 11 }}
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = URL.createObjectURL(new Blob([JSON.stringify(g.result_data, null, 2)], { type: "application/json" }));
                                a.download = `${tool}_${g.title?.replace(/\s+/g, "_") || "export"}.json`;
                                a.click();
                              }}
                            >
                              JSON
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ));
          })()}
        </>
      )}

      {/* Use in Tools */}
      <div className="section-label" style={{ marginTop: 8 }}>Use This Project In</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { to: "/scope", label: "ScopeGPT", icon: "📋" },
          { to: "/schedule", label: "ScheduleGPT", icon: "📅" },
          { to: "/bidmatch", label: "BidMatch", icon: "⚖" },
          { to: "/changeorder", label: "ChangeOrderGPT", icon: "✏" },
          { to: "/fieldledger", label: "FieldLedger", icon: "📒" },
        ].map(t => (
          <div key={t.to}
            onClick={() => navigate(t.to)}
            style={{ background: "#ffffff", border: "1px solid #e0e4ef", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#f0a500"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#e0e4ef"}
          >
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}