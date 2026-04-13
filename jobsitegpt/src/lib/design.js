// ─── JobSiteGPT Design System ─────────────────────────────────────────────────

export const C = {
  bg: "#0c0f18",
  surface: "#131720",
  surfaceHigh: "#1a2030",
  surfaceHover: "#1f2640",
  border: "#252d42",
  borderHover: "#3a4a70",
  accent: "#f0a500",
  accentHover: "#ffc030",
  accentGlow: "rgba(240,165,0,0.12)",
  accentDim: "rgba(240,165,0,0.06)",
  text: "#e2e6f0",
  muted: "#6b7599",
  dim: "#404868",
  success: "#27ae60",
  successBg: "rgba(39,174,96,0.1)",
  error: "#e74c3c",
  errorBg: "rgba(231,76,60,0.08)",
  blue: "#4a90e2",
  blueBg: "rgba(74,144,226,0.08)",
  blueBorder: "rgba(74,144,226,0.25)",
  purple: "#8b5cf6",
  purpleBg: "rgba(139,92,246,0.08)",
};

export const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&family=Barlow:wght@400;500;600&display=swap');`;

export const BASE_CSS = `
${FONTS}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: ${C.bg};
  color: ${C.text};
  font-family: 'Barlow', sans-serif;
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
}

/* Grid background */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(240,165,0,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(240,165,0,0.025) 1px, transparent 1px);
  background-size: 44px 44px;
  pointer-events: none;
  z-index: 0;
}

#root { position: relative; z-index: 1; }

/* ── Typography ── */
.font-display { font-family: 'Barlow Condensed', sans-serif; }
.font-mono { font-family: 'IBM Plex Mono', monospace; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: ${C.bg}; }
::-webkit-scrollbar-thumb { background: ${C.border}; }
::-webkit-scrollbar-thumb:hover { background: ${C.borderHover}; }

/* ── Animations ── */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }

.fade-up { animation: fadeUp 0.3s ease both; }
`;

export const SHARED_COMPONENTS_CSS = `
/* ── Section label ── */
.section-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: ${C.accent};
  text-transform: uppercase;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, ${C.border}, transparent);
}

/* ── Field ── */
.field-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: ${C.muted};
  text-transform: uppercase;
  margin-bottom: 7px;
  display: block;
}

input[type="text"], input[type="email"], input[type="password"], textarea, select {
  width: 100%;
  background: ${C.surface};
  border: 1px solid ${C.border};
  color: ${C.text};
  font-family: 'Barlow', sans-serif;
  font-size: 14px;
  padding: 11px 14px;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
  border-radius: 2px;
}
input:focus, textarea:focus, select:focus {
  border-color: ${C.accent};
  background: ${C.surfaceHigh};
}
textarea { resize: vertical; min-height: 110px; line-height: 1.65; }
select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7599'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
}

/* ── Row grid ── */
.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
@media (max-width: 640px) { .row-2, .row-3 { grid-template-columns: 1fr; } }

/* ── Input group ── */
.input-group { margin-bottom: 24px; }

/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid ${C.border};
  background: ${C.surfaceHigh};
  color: ${C.text};
  border-radius: 2px;
}
.btn:hover { border-color: ${C.borderHover}; background: ${C.surfaceHover}; color: #fff; }
.btn:disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }

.btn-primary {
  background: ${C.accent};
  color: #000;
  border-color: ${C.accent};
}
.btn-primary:hover { background: ${C.accentHover}; border-color: ${C.accentHover}; color: #000; }

.btn-lg {
  padding: 14px 32px;
  font-size: 16px;
  letter-spacing: 0.12em;
  width: 100%;
  justify-content: center;
  clip-path: polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%);
}
.btn-lg.btn-primary:disabled {
  background: ${C.border};
  color: ${C.dim};
  border-color: transparent;
  clip-path: none;
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: ${C.muted};
}
.btn-ghost:hover { background: ${C.surfaceHigh}; border-color: ${C.border}; color: ${C.text}; }

/* ── Upload zone ── */
.upload-zone {
  border: 1.5px dashed ${C.border};
  background: ${C.surface};
  padding: 28px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border-radius: 2px;
}
.upload-zone:hover, .upload-zone.drag { border-color: ${C.accent}; background: ${C.accentDim}; }
.upload-zone input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.upload-zone-icon { font-size: 28px; margin-bottom: 10px; line-height: 1; }
.upload-zone-text { font-family: 'Barlow Condensed', sans-serif; font-weight: 600; font-size: 14px; color: ${C.muted}; }
.upload-zone-hint { font-size: 11px; color: ${C.dim}; font-family: 'IBM Plex Mono', monospace; margin-top: 5px; }

/* ── File chips ── */
.file-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.file-chip {
  background: ${C.surfaceHigh};
  border: 1px solid ${C.border};
  padding: 5px 10px;
  font-size: 11px;
  font-family: 'IBM Plex Mono', monospace;
  color: ${C.muted};
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 2px;
}
.file-chip-x { cursor: pointer; color: ${C.dim}; line-height: 1; font-size: 13px; }
.file-chip-x:hover { color: ${C.error}; }

/* ── Processing steps ── */
.processing-wrap {
  background: ${C.surface};
  border: 1px solid ${C.border};
  padding: 52px 32px;
  text-align: center;
  border-top: 3px solid ${C.accent};
}
.processing-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 22px;
  letter-spacing: 0.08em;
  color: ${C.accent};
  margin-bottom: 36px;
}
.step-list { display: flex; flex-direction: column; gap: 14px; max-width: 340px; margin: 0 auto; }
.step-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  text-align: left;
}
.step-row.done { color: ${C.success}; }
.step-row.active { color: ${C.text}; }
.step-row.pending { color: ${C.dim}; }
.step-row.active .step-dot { animation: pulse 1s infinite; }
.step-dot { width: 18px; flex-shrink: 0; text-align: center; font-size: 11px; }

/* ── Error box ── */
.error-box {
  background: ${C.errorBg};
  border: 1px solid rgba(231,76,60,0.25);
  padding: 14px 18px;
  color: ${C.error};
  font-size: 13px;
  border-radius: 2px;
  margin-top: 14px;
}

/* ── Toast ── */
.toast {
  position: fixed;
  bottom: 28px;
  right: 28px;
  background: ${C.success};
  color: #fff;
  padding: 11px 18px;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.08em;
  z-index: 9999;
  border-radius: 2px;
  animation: fadeUp 0.25s ease, fadeOut 0.3s ease 1.8s forwards;
}
@keyframes fadeOut { to { opacity: 0; transform: translateY(6px); } }

/* ── Result header card ── */
.result-header-card {
  background: ${C.surface};
  border: 1px solid ${C.border};
  border-top: 3px solid ${C.accent};
  padding: 22px 26px;
  margin-bottom: 24px;
}
.result-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 26px;
  letter-spacing: 0.04em;
  margin-bottom: 5px;
}
.result-meta {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: ${C.muted};
}
.result-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }

/* ── Stat cards ── */
.stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card {
  background: ${C.surface};
  border: 1px solid ${C.border};
  padding: 16px 18px;
}
.stat-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: ${C.muted};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}
.stat-value {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 28px;
  color: ${C.accent};
  letter-spacing: 0.02em;
  line-height: 1;
}
.stat-sub { font-size: 11px; color: ${C.dim}; margin-top: 5px; }
`;

export function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

export async function callClaude(messages, systemPrompt, maxTokens = 4000) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `API error ${response.status}`);
  }
  const data = await response.json();
  const raw = data.content.find((b) => b.type === "text")?.text || "";
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}
