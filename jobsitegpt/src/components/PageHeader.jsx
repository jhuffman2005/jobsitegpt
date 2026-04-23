import { useNavigate } from "react-router-dom";

const META = {
  "/":            { badge: "HOME",    title: "Dashboard",      sub: "JobSiteGPT Beta" },
  "/projects":    { badge: "PROJECTS", title: "Projects",      sub: "Manage your jobs" },
  "/settings":    { badge: "SETTINGS", title: "Settings",      sub: "Account & cost codes" },
  "/scope":       { badge: "01 / 05", title: "ScopeGPT",       sub: "Scope of Work Generator" },
  "/schedule":    { badge: "02 / 05", title: "ScheduleGPT",    sub: "Project Schedule Generator" },
  "/bidmatch":    { badge: "03 / 05", title: "BidMatch",       sub: "Bid Leveler & Comparison" },
  "/changeorder": { badge: "04 / 05", title: "ChangeOrderGPT", sub: "Change Order Writer" },
  "/fieldledger": { badge: "05 / 05", title: "FieldLedger",    sub: "AI Job Cost Ledger" },
};

export default function PageHeader({ pathname, activeProject, onMenuClick }) {
  const navigate = useNavigate();
  const isProjectDetail = pathname.startsWith("/projects/") && pathname !== "/projects";
  const meta = isProjectDetail
    ? { badge: "PROJECT", title: "Project Setup", sub: "Details & File Repository" }
    : META[pathname] || META["/"];

  return (
    <div className="page-header">
      <button
        type="button"
        className="nav-hamburger"
        aria-label="Open menu"
        onClick={onMenuClick}
      >
        <span /><span /><span />
      </button>
      <span className="page-title-badge">{meta.badge}</span>
      <span className="page-title">{meta.title}</span>

      {/* Active project pill on tool pages */}
      {activeProject && META[pathname] && pathname !== "/" && pathname !== "/projects" && (
        <div
          onClick={() => navigate(`/projects/${activeProject.id}`)}
          style={{ marginLeft: 16, display: "flex", alignItems: "center", gap: 8, background: "rgba(240,165,0,0.08)", border: "1px solid rgba(240,165,0,0.2)", padding: "4px 12px", cursor: "pointer", transition: "all 0.15s" }}
        >
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, color: "#f0a500", letterSpacing: "0.1em", textTransform: "uppercase" }}>Project</span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: "#e2e6f0" }}>{activeProject.name}</span>
        </div>
      )}

      <span className="page-sub">{meta.sub}</span>
    </div>
  );
}