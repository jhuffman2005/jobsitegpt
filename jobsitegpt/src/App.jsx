import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

import Sidebar from "./components/Sidebar";
import PageHeader from "./components/PageHeader";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Settings from "./pages/Settings";
import Approve from "./pages/Approve";
import TradeBid from "./pages/TradeBid";
import ScopeGPT from "./tools/ScopeGPT";
import ScheduleGPT from "./tools/ScheduleGPT";
import BidMatch from "./tools/BidMatch";
import ChangeOrderGPT from "./tools/ChangeOrderGPT";
import FieldLedger from "./tools/FieldLedger";

function AppShell({ user }) {
  const location = useLocation();
  const [activeProject, setActiveProject] = useState(() => {
    try {
      const saved = sessionStorage.getItem("jsg_active_project");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const setProject = (p) => {
    setActiveProject(p);
    if (p) sessionStorage.setItem("jsg_active_project", JSON.stringify(p));
    else sessionStorage.removeItem("jsg_active_project");
  };

  // Close mobile nav on route change
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  const toolProps = { activeProject, onProjectChange: setProject };

  return (
    <>
      <Sidebar user={user} activeProject={activeProject} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <div className="main-wrap">
        <PageHeader pathname={location.pathname} activeProject={activeProject} onMenuClick={() => setMobileNavOpen(true)} />
        <div className="page-content">
          <Routes>
            <Route path="/"             element={<Dashboard user={user} />} />
            <Route path="/projects"     element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail onProjectLoad={setProject} />} />
            <Route path="/settings"     element={<Settings />} />
            <Route path="/scope"        element={<ScopeGPT {...toolProps} />} />
            <Route path="/schedule"     element={<ScheduleGPT {...toolProps} />} />
            <Route path="/bidmatch"     element={<BidMatch {...toolProps} />} />
            <Route path="/changeorder"  element={<ChangeOrderGPT {...toolProps} />} />
            <Route path="/fieldledger"  element={<FieldLedger {...toolProps} />} />
            <Route path="*"             element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Approve pages are publicly accessible (no auth required)
  if (window.location.pathname.startsWith("/approve/")) {
    return (
      <Routes>
        <Route path="/approve/:token" element={<Approve />} />
      </Routes>
    );
  }

  // Trade bid pages are publicly accessible (gated by token)
  if (window.location.pathname.startsWith("/bid/")) {
    return (
      <Routes>
        <Route path="/bid/:token" element={<TradeBid />} />
      </Routes>
    );
  }

  if (user === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#909ab0" }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <Auth />;

  return <AppShell user={user} />;
}
