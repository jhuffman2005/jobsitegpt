import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getProjects } from "../lib/projects";

export default function ProjectSwitcher({ activeProject, onProjectChange }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  return (
    <div style={{ marginBottom: 22, position: "relative" }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          background: "#ffffff",
          border: "1.5px solid #e0e4ef",
          borderLeft: "4px solid #f0a500",
          padding: "12px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderRadius: "0 8px 8px 0",
          transition: "all 0.15s",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 16 }}>📁</span>
        <div style={{ flex: 1 }}>
          {activeProject ? (
            <>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>
                {activeProject.name}
              </div>
              <div style={{ fontSize: 11, color: "#909ab0" }}>
                {[activeProject.client_name, activeProject.address].filter(Boolean).join(" · ") || "Click to switch project"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: "#909ab0" }}>
                No project selected
              </div>
              <div style={{ fontSize: 11, color: "#c0c8d8" }}>Click to select a project</div>
            </>
          )}
        </div>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "#c0c8d8" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          background: "#ffffff",
          border: "1.5px solid #e0e4ef",
          borderRadius: 8,
          zIndex: 100,
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          maxHeight: 280,
          overflowY: "auto",
          marginTop: 4,
        }}>
          {projects.length === 0 ? (
            <div
              style={{ padding: "14px 16px", fontSize: 13, color: "#909ab0", cursor: "pointer" }}
              onClick={() => { setOpen(false); navigate("/projects"); }}
            >
              No projects yet — click to create one →
            </div>
          ) : (
            <>
              {projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => { onProjectChange(p); setOpen(false); }}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f0f2f5",
                    background: activeProject?.id === p.id ? "rgba(240,165,0,0.06)" : "#ffffff",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(240,165,0,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = activeProject?.id === p.id ? "rgba(240,165,0,0.06)" : "#ffffff"}
                >
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: "#1a1f2e", marginBottom: 2 }}>
                    {p.name}
                    {activeProject?.id === p.id && <span style={{ marginLeft: 8, fontSize: 10, color: "#f0a500", fontFamily: "'Inter',sans-serif" }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#909ab0", fontFamily: "'Inter',sans-serif" }}>
                    {[p.client_name, p.address].filter(Boolean).join(" · ") || "No details"}
                  </div>
                </div>
              ))}
              <div
                style={{ padding: "12px 16px", fontSize: 12, color: "#4a90e2", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: "0.06em" }}
                onClick={() => { setOpen(false); navigate("/projects"); }}
              >
                + MANAGE PROJECTS
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}