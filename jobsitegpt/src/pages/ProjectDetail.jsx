import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getProject, updateProject,
  getProjectFiles, uploadProjectFile,
  deleteProjectFile, getProjectFileUrl,
  getGenerations,
} from "../lib/projects";

export default function ProjectDetail({ onProjectLoad }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [generations, setGenerations] = useState([]);
  const [expandedGen, setExpandedGen] = useState(null);
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
            const TOOL_ROUTES = {
              ScopeGPT: "/scope",
              ScheduleGPT: "/schedule",
              ChangeOrderGPT: "/changeorder",
              BidMatch: "/bidmatch",
              FieldLedger: "/fieldledger",
            };
            // Tools that support hydrating a saved generation via ?historyId= URL param
            const TOOL_SUPPORTS_HISTORY = {
              ScopeGPT: true,
              ScheduleGPT: true,
              ChangeOrderGPT: true,
              BidMatch: false,
              FieldLedger: false,
            };
            const escapeHtml = (s) =>
              String(s ?? "")
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
            const fmtMoney = (n) =>
              `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const renderToolBody = (tool, d) => {
              if (!d) return "";
              if (tool === "ScopeGPT") {
                const meta = [d.projectType, d.projectAddress, d.estimatedDuration].filter(Boolean).map(escapeHtml).join(" · ");
                const trades = (d.trades || []).map((t) => `
                  <section class="block">
                    <div class="block-hdr"><span class="num">#${escapeHtml(String(t.id || "").padStart(2, "0"))}</span><span class="ttl">${escapeHtml(t.tradeName || "")}</span>${t.contractor ? `<span class="badge">${escapeHtml(t.contractor)}</span>` : ""}</div>
                    ${t.scopeText ? `<p class="scope-text">${escapeHtml(t.scopeText)}</p>` : ""}
                    ${(t.lineItems || []).length ? `<ul class="li-list">${t.lineItems.map((li) => `<li><span class="li-desc">${escapeHtml(li.description || "")}</span>${li.note ? `<span class="li-note">${escapeHtml(li.note)}</span>` : ""}</li>`).join("")}</ul>` : ""}
                  </section>`).join("");
                const list = (label, arr) => (arr?.length
                  ? `<section class="block"><h3>${label}</h3><ul class="plain">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>` : "");
                return `
                  ${meta ? `<div class="meta">${meta}</div>` : ""}
                  ${d.overview ? `<section class="block"><h3>Overview</h3><p>${escapeHtml(d.overview)}</p></section>` : ""}
                  ${trades ? `<h2 class="section">Scope by Trade</h2>${trades}` : ""}
                  ${list("General Conditions", d.generalConditions)}
                  ${list("Exclusions", d.exclusions)}
                  ${list("Clarifications", d.clarifications)}
                `;
              }
              if (tool === "ChangeOrderGPT") {
                const lines = (d.lineItems || []).map((li) => `
                  <tr><td>${escapeHtml(li.trade || "")}</td><td>${escapeHtml(li.description || "")}</td><td class="num">${Number(li.quantity || 0)}</td><td>${escapeHtml(li.unit || "")}</td><td class="num">${fmtMoney(li.unitPrice)}</td><td class="num">${fmtMoney(li.totalPrice)}</td></tr>`).join("");
                return `
                  <div class="meta">CO #${escapeHtml(d.changeOrderNumber || "")}${d.date ? ` · ${escapeHtml(d.date)}` : ""}${d.clientName ? ` · Client: ${escapeHtml(d.clientName)}` : ""}</div>
                  ${d.description ? `<section class="block"><h3>Description</h3><p>${escapeHtml(d.description)}</p></section>` : ""}
                  ${d.reason ? `<section class="block"><h3>Reason</h3><p>${escapeHtml(d.reason)}</p></section>` : ""}
                  ${lines ? `<section class="block"><h3>Line Items</h3><table class="tbl"><thead><tr><th>Trade</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table></section>` : ""}
                  <section class="block totals">
                    <div><span>Subtotal</span><b>${fmtMoney(d.subtotal)}</b></div>
                    <div><span>Overhead</span><b>${fmtMoney(d.overhead)}</b></div>
                    <div><span>Profit</span><b>${fmtMoney(d.profit)}</b></div>
                    <div class="grand"><span>Total</span><b>${fmtMoney(d.totalAmount)}</b></div>
                    ${d.daysAdded ? `<div><span>Days Added</span><b>+${escapeHtml(String(d.daysAdded))}</b></div>` : ""}
                  </section>
                  ${d.contractLanguage ? `<section class="block"><h3>Contract Language</h3><p>${escapeHtml(d.contractLanguage)}</p></section>` : ""}
                  ${d.notes ? `<section class="block"><h3>Notes</h3><p>${escapeHtml(d.notes)}</p></section>` : ""}
                `;
              }
              if (tool === "ScheduleGPT") {
                const tasks = (d.tasks || []).map((t) => `
                  <tr><td class="num">${escapeHtml(String(t.id || ""))}</td><td>${escapeHtml(t.task || "")}</td><td>${escapeHtml(t.phase || "")}</td><td>${escapeHtml(t.trade || "")}</td><td class="num">Day ${escapeHtml(String(t.startDay || ""))}</td><td class="num">${escapeHtml(String(t.durationDays || ""))}d</td><td>${escapeHtml((t.dependencies || []).join(", ") || "—")}</td><td>${escapeHtml(t.notes || "")}</td></tr>`).join("");
                const subs = (d.subcontractors || []).map((s) => `
                  <tr><td>${escapeHtml(s.trade || "")}</td><td>${escapeHtml(s.phase || "")}</td><td class="num">${escapeHtml(String(s.estimatedDays || ""))}d</td><td>${escapeHtml((s.recommendedSubTypes || []).join(", "))}</td><td>${escapeHtml(s.scope || "")}</td></tr>`).join("");
                return `
                  <div class="meta">${d.phases?.length ? `${d.phases.length} phases · ` : ""}${d.tasks?.length || 0} tasks${d.totalDays ? ` · ${d.totalDays} days` : ""}</div>
                  ${tasks ? `<section class="block"><h3>Tasks</h3><table class="tbl"><thead><tr><th>#</th><th>Task</th><th>Phase</th><th>Trade</th><th>Start</th><th>Duration</th><th>Dependencies</th><th>Notes</th></tr></thead><tbody>${tasks}</tbody></table></section>` : ""}
                  ${subs ? `<section class="block"><h3>Subcontractors</h3><table class="tbl"><thead><tr><th>Trade</th><th>Phase</th><th>Est. Days</th><th>Recommended Sub Types</th><th>Scope</th></tr></thead><tbody>${subs}</tbody></table></section>` : ""}
                `;
              }
              // Fallback (other tools) — render known-shape fields as definition list
              const fallback = Object.entries(d).filter(([, v]) => typeof v !== "object" || Array.isArray(v))
                .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${Array.isArray(v) ? v.map(escapeHtml).join(", ") : escapeHtml(v)}</dd>`).join("");
              return fallback ? `<dl class="dl">${fallback}</dl>` : "";
            };
            const renderHtml = (tool, g) => {
              const title = escapeHtml(g.title || tool);
              const date = new Date(g.created_at).toLocaleString();
              const body = renderToolBody(tool, g.result_data);
              const styles = `
                *{box-sizing:border-box}
                body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:880px;margin:32px auto;padding:0 24px;color:#1a1f2e;line-height:1.55;}
                h1{font-size:24px;margin:0 0 4px;font-weight:800;letter-spacing:0.02em}
                h2.section{font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#909ab0;margin:28px 0 10px;font-weight:700}
                h3{font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#606880;margin:0 0 8px;font-weight:700}
                .meta{font-size:13px;color:#606880;margin-bottom:18px}
                .summary{background:#f7f8fb;border:1px solid #e0e4ef;padding:14px 16px;border-radius:6px;margin-bottom:20px;font-size:13px}
                .block{margin:0 0 18px;padding:14px 16px;border:1px solid #e0e4ef;border-radius:6px;background:#fff;page-break-inside:avoid}
                .block p{margin:0 0 6px;font-size:13px}
                .block-hdr{display:flex;align-items:center;gap:10px;margin-bottom:10px}
                .block-hdr .num{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#909ab0}
                .block-hdr .ttl{font-weight:700;font-size:14px}
                .block-hdr .badge{font-size:11px;background:#fff4d6;color:#c47f00;padding:2px 8px;border-radius:10px}
                .scope-text{font-size:13px;color:#1a1f2e;margin:0 0 8px}
                .li-list{list-style:none;padding:0;margin:6px 0 0}
                .li-list li{padding:4px 0;font-size:13px;display:flex;gap:8px;align-items:baseline;border-top:1px dashed #eef0f5}
                .li-list li:before{content:"▸";color:#f0a500;font-size:10px}
                .li-desc{flex:1}
                .li-note{color:#909ab0;font-size:11px;font-style:italic}
                ul.plain{margin:0;padding-left:18px;font-size:13px}
                ul.plain li{margin:3px 0}
                table.tbl{width:100%;border-collapse:collapse;font-size:12px}
                table.tbl th,table.tbl td{text-align:left;padding:6px 8px;border-bottom:1px solid #e8ebf2;vertical-align:top}
                table.tbl th{background:#f7f8fb;color:#606880;font-weight:700;font-size:11px;letter-spacing:0.06em;text-transform:uppercase}
                table.tbl td.num,table.tbl th.num{text-align:right;font-family:ui-monospace,Menlo,monospace}
                .totals{background:#f7f8fb}
                .totals>div{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
                .totals .grand{border-top:2px solid #1a1f2e;margin-top:6px;padding-top:8px;font-size:15px;font-weight:800}
                .dl{font-size:13px}
                .dl dt{font-weight:700;margin-top:6px;color:#606880}
                .dl dd{margin:0 0 4px}
                @media print{body{margin:0;padding:16px;max-width:none}.block{break-inside:avoid}}
              `;
              return `<!doctype html><html><head><meta charset="utf-8"><title>${title} — ${escapeHtml(tool)}</title><style>${styles}</style></head><body><h1>${title}</h1><div class="meta">${escapeHtml(tool)} · ${escapeHtml(date)}</div>${g.summary ? `<div class="summary">${escapeHtml(g.summary)}</div>` : ""}${body || `<p style="color:#909ab0;font-style:italic">No formatted output available for this generation.</p>`}</body></html>`;
            };
            const downloadBlob = (content, filename, mime) => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([content], { type: mime }));
              a.download = filename;
              a.click();
            };
            const exportJson = (tool, g) => {
              downloadBlob(
                JSON.stringify(g.result_data, null, 2),
                `${tool}_${g.title?.replace(/\s+/g, "_") || "export"}.json`,
                "application/json"
              );
            };
            const exportHtml = (tool, g) => {
              downloadBlob(
                renderHtml(tool, g),
                `${tool}_${g.title?.replace(/\s+/g, "_") || "export"}.html`,
                "text/html"
              );
            };
            const exportPdf = (tool, g) => {
              // Open a printable HTML view and trigger the browser's print dialog
              // so the user can choose "Save as PDF" (no external PDF library required).
              const w = window.open("", "_blank");
              if (!w) { setError("Popup blocked — allow popups to export PDF."); return; }
              w.document.open();
              w.document.write(renderHtml(tool, g));
              w.document.close();
              w.focus();
              setTimeout(() => { try { w.print(); } catch {} }, 300);
            };
            const viewInApp = (tool, g) => {
              const route = TOOL_ROUTES[tool];
              if (!route) return;
              // Pass the generation ID via URL so the tool can fetch & hydrate on mount.
              if (TOOL_SUPPORTS_HISTORY[tool]) navigate(`${route}?historyId=${encodeURIComponent(g.id)}`);
              else navigate(route);
            };
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
                      onClick={() => setExpandedGen(expandedGen === g.id ? null : g.id)}
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
                        <div style={{ fontSize: 12, color: "#606880", lineHeight: 1.6, marginTop: 10 }}>{g.summary}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: "5px 12px", fontSize: 11 }}
                            onClick={() => viewInApp(tool, g)}
                          >
                            ↗ View in {tool}
                          </button>
                          {g.result_data && (
                            <>
                              <button
                                className="btn"
                                style={{ padding: "5px 12px", fontSize: 11 }}
                                onClick={() => exportPdf(tool, g)}
                              >
                                ⬇ Export PDF
                              </button>
                              <button
                                className="btn"
                                style={{ padding: "5px 12px", fontSize: 11 }}
                                onClick={() => exportHtml(tool, g)}
                              >
                                ⬇ Export HTML
                              </button>
                              <button
                                className="btn"
                                style={{ padding: "5px 12px", fontSize: 11 }}
                                onClick={() => exportJson(tool, g)}
                              >
                                ⬇ Export JSON
                              </button>
                            </>
                          )}
                        </div>
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