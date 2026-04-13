import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

import Sidebar from "./components/Sidebar";
import PageHeader from "./components/PageHeader";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ScopeGPT from "./tools/ScopeGPT";
import ScheduleGPT from "./tools/ScheduleGPT";
import BidMatch from "./tools/BidMatch";
import ChangeOrderGPT from "./tools/ChangeOrderGPT";
import FieldLedger from "./tools/FieldLedger";

function AppShell({ user }) {
  const location = useLocation();

  return (
    <>
      <Sidebar user={user} />
      <div className="main-wrap">
        <PageHeader pathname={location.pathname} />
        <div className="page-content">
          <Routes>
            <Route path="/"            element={<Dashboard user={user} />} />
            <Route path="/scope"       element={<ScopeGPT />} />
            <Route path="/schedule"    element={<ScheduleGPT />} />
            <Route path="/bidmatch"    element={<BidMatch />} />
            <Route path="/changeorder" element={<ChangeOrderGPT />} />
            <Route path="/fieldledger" element={<FieldLedger />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes (magic link callback, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Loading state — brief flash while Supabase checks session
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
