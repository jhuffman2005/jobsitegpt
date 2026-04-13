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
  const [activeProject, setActiveProject] = useState(null);

  return (
    <>
      <Sidebar user={user} activeProject={activeProject} />
      <div className="main-wrap">
        <PageHeader pathname={location.pathname} activeProject={activeProject} />
        <div className="page-content">
          <Routes>
            <Route path="/"            element={<Dashboard user={user} />} />
            <Route path="/projects"    element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail onProjectLoad={setActiveProject} />} />
            <Route path="/scope"       element={<ScopeGPT activeProject={activeProject} />} />
            <Route path="/schedule"    element={<ScheduleGPT activeProject={activeProject} />} />
            <Route path="/bidmatch"    element={<BidMatch activeProject={activeProject} />} />
            <Route path="/changeorder" element={<ChangeOrderGPT activeProject={activeProject} />} />
            <Route path="/fieldledger" element={<FieldLedger activeProject={activeProject} />} />
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
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#3a4260" }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <Auth />;

  return <AppShell user={user} />;
}