import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

const BETA_CODE = import.meta.env.VITE_BETA_CODE || "JOBSITE2026";

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!email.trim()) { setError("Email is required."); return; }

    if (mode === "register") {
      if (code.toUpperCase().trim() !== BETA_CODE) {
        setError("Invalid beta access code. Contact your JobSiteGPT rep to get access.");
        return;
      }
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: "https://jobsitegpt.vercel.app",
        data: { beta_code: code.toUpperCase().trim() },
      },
    });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="auth-wrap fade-up">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✉️</div>
          <div className="auth-title">Check your email</div>
          <div className="auth-sub" style={{ marginTop: 8 }}>
            We sent a magic link to <strong>{email}</strong>.<br />
            Click it to sign in — no password needed.
          </div>
          <button
            className="btn btn-ghost"
            style={{ marginTop: 24, width: "100%", justifyContent: "center" }}
            onClick={() => { setSent(false); setEmail(""); setCode(""); }}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap fade-up">
      <div className="auth-card">
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div><span className="logo-badge">JOBSITEGPT</span></div>
          <div className="logo-title" style={{ marginTop: 8, fontSize: 24 }}>Construction AI Suite</div>
          <div style={{ marginTop: 12, display: "inline-block", background: "rgba(240,165,0,0.12)", border: "1px solid rgba(240,165,0,0.2)", color: "#f0a500", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: "3px 12px", letterSpacing: "0.1em" }}>
            BETA ACCESS
          </div>
        </div>

        <div className="auth-title">{mode === "login" ? "Sign In" : "Request Access"}</div>
        <div className="auth-sub">
          {mode === "login"
            ? "We'll email you a magic link. No password needed."
            : "Enter your beta access code to create an account."}
        </div>

        {mode === "register" && (
          <div className="input-group">
            <label className="field-label">Beta Access Code</label>
            <input
              type="text"
              placeholder="XXXXXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
            />
          </div>
        )}

        <div className="input-group">
          <label className="field-label">Email Address</label>
          <input
            type="email"
            placeholder="you@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        {error && <div className="error-box">{error}</div>}

        <button
          className="btn btn-primary btn-lg"
          style={{ marginTop: 20 }}
          disabled={loading || !email.trim()}
          onClick={handleSubmit}
        >
          {loading ? "Sending…" : mode === "login" ? "Send Magic Link →" : "Request Access →"}
        </button>

        <div className="auth-switch">
          {mode === "login" ? (
            <>
              Need access?{" "}
              <span onClick={() => { setMode("register"); setError(""); }}>
                Enter beta code
              </span>
            </>
          ) : (
            <>
              Already have access?{" "}
              <span onClick={() => { setMode("login"); setError(""); }}>
                Sign in
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
