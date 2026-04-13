import { NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const NAV = [
  { to: "/",            label: "Dashboard",      icon: "⌂" },
  { to: "/scope",       label: "ScopeGPT",       icon: "📋" },
  { to: "/schedule",    label: "ScheduleGPT",    icon: "📅" },
  { to: "/bidmatch",    label: "BidMatch",       icon: "⚖" },
  { to: "/changeorder", label: "ChangeOrderGPT", icon: "✏" },
  { to: "/fieldledger", label: "FieldLedger",    icon: "📒" },
];

export default function Sidebar({ user }) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div><span className="logo-badge">JOBSITEGPT</span></div>
        <div className="logo-title">JobSiteGPT</div>
        <div className="logo-sub">Construction AI Suite</div>
      </div>

      <div className="nav-section-title">Tools</div>

      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
        >
          <span className="nav-item-icon">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}

      <div className="nav-footer">
        <div className="nav-user">{user?.email || "Beta User"}</div>
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
