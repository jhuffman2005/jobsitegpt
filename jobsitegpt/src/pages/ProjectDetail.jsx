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
                        {g.result_data && (
                          <button
                            className="btn"
                            style={{ marginTop: 10, padding: "5px 12px", fontSize: 11 }}
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = URL.createObjectURL(new Blob([JSON.stringify(g.result_data, null, 2)], { type: "application/json" }));
                              a.download = `${tool}_${g.title?.replace(/\s+/g, "_") || "export"}.json`;
                              a.click();
                            }}
                          >
                            ⬇ Export JSON
                          </button>
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