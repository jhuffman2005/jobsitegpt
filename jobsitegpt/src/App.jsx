import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

import Sidebar from "./components/Sidebar";
import PageHeader from "./components/PageHeader";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
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

  const setProject = (p) => {
    setActiveProject(p);
    if (p) sessionStorage.setItem("jsg_active_project", JSON.stringify(p));
    else sessionStorage.removeItem("jsg_active_project");
  };

  const toolProps = { activeProject, onProjectChange: setProject };

  return (
    <>
      <Sidebar user={user} activeProject={activeProject} />
      <div className="main-wrap">
        <PageHeader pathname={location.pathname} activeProject={activeProject} />
        <div className="page-content">
          <Routes>
            <Route path="/"            element={<Dashboard user={user} />} />
            <Route path="/projects"    element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail onProjectLoad={setProject} />} />
            <Route path="/scope"       element={<ScopeGPT {...toolProps} />} />
            <Route path="/schedule"    element={<ScheduleGPT {...toolProps} />} />
            <Route path="/bidmatch"    element={<BidMatch {...toolProps} />} />
            <Route path="/changeorder" element={<ChangeOrderGPT {...toolProps} />} />
            <Route path="/fieldledger" element={<FieldLedger {...toolProps} />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
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

  if (user === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#909ab0" }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <Auth />;

  return <AppShell user={user} />;
}