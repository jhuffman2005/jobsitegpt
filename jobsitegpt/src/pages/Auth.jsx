import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

const BETA_CODE = import.meta.env.VITE_BETA_CODE || "JOBSITE2026";

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | register | password
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleMagicLink = async () => {
    setError("");
    if (!email.trim()) { setError("Email is required."); return; }
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: "https://jobsitegpt.vercel.app" },
    });
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    setSent(true);
  };

  const handlePasswordLogin = async () => {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Email and password required."); return; }
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });
    setLoading(false);
    if (authError) { setError(authError.message); return; }
  };

  const handleRegister = async () => {
    setError("");
    if (code.toUpperCase().trim() !== BETA_CODE) {
      setError("Invalid beta access code. Contact your JobSiteGPT rep.");
      return;
    }
    if (!email.trim() || !password.trim()) { setError("Email and password required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: { emailRedirectTo: "https://jobsitegpt.vercel.app" },
    });
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="auth-wrap fade-up">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✉️</div>
          <div className="auth-title">Check your email</div>
          <div className="auth-sub" style={{ marginTop: 8 }}>
            {mode === "login"
              ? <>We sent a magic link to <strong>{email}</strong>. Click it to sign in.</>
              : <>We sent a confirmation to <strong>{email}</strong>. Click it, then sign in with your password.</>
            }
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 24, width: "100%", justifyContent: "center" }}
            onClick={() => { setSent(false); setEmail(""); setPassword(""); setCode(""); }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap fade-up">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div><span className="logo-badge">JOBSITEGPT</span></div>
          <div className="logo-title" style={{ marginTop: 8, fontSize: 24 }}>Construction AI Suite</div>
          <div style={{ marginTop: 12, display: "inline-block", background: "rgba(240,165,0,0.12)", border: "1px solid rgba(240,165,0,0.2)", color: "#f0a500", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: "3px 12px", letterSpacing: "0.1em" }}>
            BETA ACCESS
          </div>
        </div>

        {mode === "login" && (
          <>
            <div className="auth-title">Sign In</div>
            <div className="auth-sub">Magic link or password — your choice.</div>
            <div className="input-group" style={{ marginTop: 20 }}>
              <label className="field-label">Email Address</label>
              <input type="email" placeholder="you@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleMagicLink()} />
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className="btn btn-primary btn-lg" style={{ marginTop: 16 }} disabled={loading || !email.trim()} onClick={handleMagicLink}>
              {loading ? "Sending…" : "Send Magic Link →"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#252d42" }} />
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#3a4260" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#252d42" }} />
            </div>
            <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => { setMode("password"); setError(""); }}>
              Sign In with Password
            </button>
            <div className="auth-switch">
              Need access? <span onClick={() => { setMode("register"); setError(""); }}>Enter beta code</span>
            </div>
          </>
        )}

        {mode === "password" && (
          <>
            <div className="auth-title">Sign In</div>
            <div className="auth-sub">Use your email and password.</div>
            <div className="input-group" style={{ marginTop: 20 }}>
              <label className="field-label">Email Address</label>
              <input type="email" placeholder="you@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="field-label">Password</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()} />
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className="btn btn-primary btn-lg" disabled={loading || !email.trim() || !password.trim()} onClick={handlePasswordLogin}>
              {loading ? "Signing in…" : "Sign In →"}
            </button>
            <div className="auth-switch">
              <span onClick={() => { setMode("login"); setError(""); }}>← Back to magic link</span>
            </div>
          </>
        )}

        {mode === "register" && (
          <>
            <div className="auth-title">Request Access</div>
            <div className="auth-sub">Enter your beta code to create an account.</div>
            <div className="input-group" style={{ marginTop: 20 }}>
              <label className="field-label">Beta Access Code</label>
              <input type="text" placeholder="XXXXXXXX" value={code} onChange={(e) => setCode(e.target.value)} style={{ textTransform: "uppercase", letterSpacing: "0.1em" }} />
            </div>
            <div className="input-group">
              <label className="field-label">Email Address</label>
              <input type="email" placeholder="you@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="field-label">Password</label>
              <input type="password" placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRegister()} />
            </div>
            {error && <div className="error-box">{error}</div>}
            <button className="btn btn-primary btn-lg" disabled={loading || !email.trim() || !password.trim() || !code.trim()} onClick={handleRegister}>
              {loading ? "Creating account…" : "Create Account →"}
            </button>
            <div className="auth-switch">
              Already have access? <span onClick={() => { setMode("login"); setError(""); }}>Sign in</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}