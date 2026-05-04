import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const NAV = [
  { to: "/",            label: "Dashboard",      icon: "⌂", end: true },
  { to: "/projects",    label: "Projects",       icon: "📁" },
  { divider: true, label: "TOOLS" },
  { to: "/scope",       label: "ScopeGPT",       icon: "📋" },
  { to: "/schedule",    label: "ScheduleGPT",    icon: "📅" },
  { to: "/bidmatch",    label: "BidMatch",       icon: "⚖" },
  { to: "/changeorder", label: "ChangeOrderGPT", icon: "✏" },
  { to: "/fieldledger", label: "FieldLedger",    icon: "📒" },
  { to: "/smartlog",    label: "SmartLog",       icon: "📓" },
];

export default function Sidebar({ user, activeProject, open, onClose }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className={`sidebar${open ? " mobile-open" : ""}`}>
      <div className="sidebar-logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
        <div><span className="logo-badge">JOBSITEGPT</span></div>
        <div className="logo-title">JobSiteGPT</div>
        <div className="logo-sub">Construction AI Suite</div>
      </div>

      {/* Active project banner */}
      {activeProject && (
        <div
          style={{ padding: "10px 18px", background: "rgba(240,165,0,0.06)", borderBottom: "1px solid rgba(240,165,0,0.15)", cursor: "pointer" }}
          onClick={() => navigate(`/projects/${activeProject.id}`)}
        >
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, color: "#f0a500", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>Active Project</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: "#e2e6f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activeProject.name}</div>
          {activeProject.client_name && (
            <div style={{ fontSize: 11, color: "#6b7599", marginTop: 2 }}>{activeProject.client_name}</div>
          )}
        </div>
      )}

      {NAV.map((item, i) => {
        if (item.divider) return (
          <div key={i} className="nav-section-title">{item.label}</div>
        );
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <span className="nav-item-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        );
      })}

      <div className="nav-footer">
        <div className="nav-user">{user?.email || "Beta User"}</div>
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          style={{ fontSize: 12, padding: "6px 0" }}
        >
          <span className="nav-item-icon">⚙</span>
          Settings
        </NavLink>
        <button
          className="btn btn-ghost"
          style={{ padding: "6px 0", fontSize: 11, width: "100%", justifyContent: "flex-start" }}
          onClick={handleLogout}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}