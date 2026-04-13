import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getProjects, createProject, deleteProject } from "../lib/projects";

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", client_name: "", client_email: "",
    client_phone: "", address: "", contract_type: "fixed_price",
    markup_percent: 0, notes: ""
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getProjects();
      setProjects(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { setError("Project name required."); return; }
    try {
      const p = await createProject(form);
      navigate(`/projects/${p.id}`);
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    try {
      await deleteProject(id);
      setProjects(p => p.filter(x => x.id !== id));
    } catch (e) { setError(e.message); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: "0.04em", marginBottom: 6 }}>Projects</div>
          <div style={{ fontSize: 14, color: "#6b7599" }}>Create a project to share context across all tools.</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowNew(true); setError(""); }}>+ New Project</button>
      </div>

      {showNew && (
        <div className="fl-card fade-up" style={{ marginBottom: 28, border: "1px solid #f0a500" }}>
          <div className="section-label">New Project</div>
          <div className="row-2 input-group">
            <div><label className="field-label">Project Name *</label><input type="text" placeholder="Oak Valley Kitchen Remodel" value={form.name} onChange={e => set("name", e.target.value)} /></div>
            <div><label className="field-label">Client Name</label><input type="text" placeholder="Johnson Family" value={form.client_name} onChange={e => set("client_name", e.target.value)} /></div>
          </div>
          <div className="row-3 input-group">
            <div><label className="field-label">Client Email</label><input type="email" placeholder="client@email.com" value={form.client_email} onChange={e => set("client_email", e.target.value)} /></div>
            <div><label className="field-label">Client Phone</label><input type="text" placeholder="(555) 555-5555" value={form.client_phone} onChange={e => set("client_phone", e.target.value)} /></div>
            <div><label className="field-label">Job Address</label><input type="text" placeholder="123 Main St" value={form.address} onChange={e => set("address", e.target.value)} /></div>
          </div>
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
              <div><label className="field-label">Markup %</label><input type="number" min="0" max="100" placeholder="15" value={form.markup_percent} onChange={e => set("markup_percent", e.target.value)} /></div>
            )}
          </div>
          <div className="input-group">
            <label className="field-label">Notes</label>
            <textarea placeholder="Any additional project notes…" value={form.notes} onChange={e => set("notes", e.target.value)} style={{ minHeight: 80 }} />
          </div>
          {error && <div className="error-box">{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={handleCreate}>Create Project →</button>
            <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#6b7599", fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>Loading projects…</div>
      ) : projects.length === 0 ? (
        <div style={{ background: "#131720", border: "1px solid #252d42", padding: "48px 32px", textAlign: "center", color: "#6b7599" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No projects yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Create your first project to get started.</div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Project</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {projects.map(p => (
            <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
              style={{ background: "#131720", border: "1px solid #252d42", padding: "18px 22px", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 16 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#3a4a70"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#252d42"}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6b7599" }}>
                  {[p.client_name, p.address, p.contract_type?.replace("_", " ")].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#3a4260" }}>
                {new Date(p.updated_at).toLocaleDateString()}
              </div>
              <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={e => handleDelete(p.id, e)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}