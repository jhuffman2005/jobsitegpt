import { useState, useRef, useCallback, useEffect } from "react";

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
const C = {
  bg: "#0c0f18", surface: "#131720", surfaceHigh: "#1a2030", surfaceHover: "#1f2640",
  border: "#252d42", borderHover: "#3a4a70",
  accent: "#f0a500", accentHover: "#ffc030", accentGlow: "rgba(240,165,0,0.12)", accentDim: "rgba(240,165,0,0.05)",
  text: "#e2e6f0", muted: "#6b7599", dim: "#3a4260",
  success: "#27ae60", successBg: "rgba(39,174,96,0.08)",
  error: "#e74c3c", errorBg: "rgba(231,76,60,0.07)",
  blue: "#4a90e2", blueBg: "rgba(74,144,226,0.07)", blueBorder: "rgba(74,144,226,0.2)",
};

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&family=Barlow:wght@400;500;600&display=swap');`;

const CSS = `
${FONTS}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;}
body{background:${C.bg};color:${C.text};font-family:'Barlow',sans-serif;font-size:15px;-webkit-font-smoothing:antialiased;}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(240,165,0,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(240,165,0,0.022) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0;}
#root{position:relative;z-index:1;min-height:100vh;}
::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};}

@keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes shimmer{0%{background-position:-400px 0;}100%{background-position:400px 0;}}
.fade-up{animation:fadeUp 0.3s ease both;}

/* ── GLOBAL INPUTS ── */
input[type=text],input[type=email],input[type=password],textarea,select{
  width:100%;background:${C.surface};border:1px solid ${C.border};color:${C.text};
  font-family:'Barlow',sans-serif;font-size:14px;padding:11px 14px;outline:none;
  transition:border-color 0.15s,background 0.15s;border-radius:2px;
}
input:focus,textarea:focus,select:focus{border-color:${C.accent};background:${C.surfaceHigh};}
textarea{resize:vertical;min-height:110px;line-height:1.65;}
select{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7599'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;}

/* ── BUTTONS ── */
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;transition:all 0.15s;border:1px solid ${C.border};background:${C.surfaceHigh};color:${C.text};border-radius:2px;}
.btn:hover{border-color:${C.borderHover};background:${C.surfaceHover};color:#fff;}
.btn:disabled{opacity:0.3;cursor:not-allowed;pointer-events:none;}
.btn-primary{background:${C.accent};color:#000;border-color:${C.accent};}
.btn-primary:hover{background:${C.accentHover};border-color:${C.accentHover};color:#000;}
.btn-ghost{background:transparent;border-color:transparent;color:${C.muted};}
.btn-ghost:hover{background:${C.surfaceHigh};border-color:${C.border};color:${C.text};}
.btn-lg{padding:14px 32px;font-size:16px;letter-spacing:0.12em;width:100%;justify-content:center;clip-path:polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%);}
.btn-lg.btn-primary:disabled{background:${C.border};color:${C.dim};border-color:transparent;clip-path:none;}

/* ── LAYOUT ── */
.row-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
.row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
@media(max-width:640px){.row-2,.row-3{grid-template-columns:1fr;}}
.input-group{margin-bottom:22px;}
.field-label{font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:11px;letter-spacing:0.12em;color:${C.muted};text-transform:uppercase;margin-bottom:7px;display:block;}
.section-label{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:0.2em;color:${C.accent};text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:10px;}
.section-label::after{content:'';flex:1;height:1px;background:linear-gradient(to right,${C.border},transparent);}

/* ── UPLOAD ── */
.upload-zone{border:1.5px dashed ${C.border};background:${C.surface};padding:28px;text-align:center;cursor:pointer;transition:all 0.2s;position:relative;border-radius:2px;}
.upload-zone:hover,.upload-zone.drag{border-color:${C.accent};background:${C.accentDim};}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;}

/* ── FILE CHIPS ── */
.file-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
.file-chip{background:${C.surfaceHigh};border:1px solid ${C.border};padding:5px 10px;font-size:11px;font-family:'IBM Plex Mono',monospace;color:${C.muted};display:flex;align-items:center;gap:8px;border-radius:2px;}
.file-chip-x{cursor:pointer;color:${C.dim};line-height:1;font-size:13px;}
.file-chip-x:hover{color:${C.error};}

/* ── PROCESSING ── */
.processing-wrap{background:${C.surface};border:1px solid ${C.border};border-top:3px solid ${C.accent};padding:52px 32px;text-align:center;}
.processing-label{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:22px;letter-spacing:0.08em;color:${C.accent};margin-bottom:36px;}
.step-list{display:flex;flex-direction:column;gap:14px;max-width:340px;margin:0 auto;}
.step-row{display:flex;align-items:center;gap:12px;font-family:'IBM Plex Mono',monospace;font-size:12px;text-align:left;}
.step-row.done{color:${C.success};}.step-row.active{color:${C.text};}.step-row.pending{color:${C.dim};}
.step-row.active .step-dot{animation:pulse 1s infinite;}
.step-dot{width:18px;flex-shrink:0;text-align:center;font-size:11px;}

/* ── STAT CARDS ── */
.stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px;}
.stat-card{background:${C.surface};border:1px solid ${C.border};padding:16px 18px;}
.stat-label{font-family:'IBM Plex Mono',monospace;font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;}
.stat-value{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:28px;color:${C.accent};letter-spacing:0.02em;line-height:1;}
.stat-sub{font-size:11px;color:${C.dim};margin-top:5px;}

/* ── RESULT HEADER ── */
.result-header-card{background:${C.surface};border:1px solid ${C.border};border-top:3px solid ${C.accent};padding:22px 26px;margin-bottom:22px;}
.result-title{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:26px;letter-spacing:0.04em;margin-bottom:5px;}
.result-meta{font-family:'IBM Plex Mono',monospace;font-size:11px;color:${C.muted};}
.result-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;}

/* ── ERROR / TOAST ── */
.error-box{background:${C.errorBg};border:1px solid rgba(231,76,60,0.22);padding:13px 17px;color:${C.error};font-size:13px;border-radius:2px;margin-top:14px;}
.toast{position:fixed;bottom:28px;right:28px;background:${C.success};color:#fff;padding:11px 18px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:0.08em;z-index:9999;border-radius:2px;animation:fadeUp 0.25s ease;}

/* ── SIDEBAR NAV ── */
.sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:${C.surface};border-right:1px solid ${C.border};display:flex;flex-direction:column;z-index:50;}
.sidebar-logo{padding:20px 18px 16px;border-bottom:1px solid ${C.border};}
.logo-badge{display:inline-block;background:${C.accent};color:#000;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:11px;letter-spacing:0.1em;padding:3px 8px;clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%);}
.logo-title{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:20px;letter-spacing:0.04em;margin-top:6px;line-height:1;}
.logo-sub{font-size:10px;color:${C.muted};font-family:'IBM Plex Mono',monospace;margin-top:3px;}
.nav-section-title{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:0.15em;color:${C.dim};text-transform:uppercase;padding:16px 18px 8px;}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 18px;cursor:pointer;transition:all 0.15s;border-left:2px solid transparent;font-size:13px;color:${C.muted};font-family:'Barlow',sans-serif;font-weight:500;}
.nav-item:hover{background:${C.surfaceHigh};color:${C.text};border-left-color:${C.border};}
.nav-item.active{background:${C.accentDim};color:${C.accent};border-left-color:${C.accent};font-weight:600;}
.nav-item-icon{font-size:14px;width:18px;text-align:center;flex-shrink:0;}
.nav-footer{margin-top:auto;padding:16px 18px;border-top:1px solid ${C.border};}
.nav-user{font-size:12px;color:${C.muted};font-family:'IBM Plex Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* ── MAIN CONTENT ── */
.main-wrap{margin-left:220px;min-height:100vh;}
.page-header{background:${C.surface};border-bottom:1px solid ${C.border};padding:18px 36px;display:flex;align-items:center;gap:16px;}
.page-title-badge{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:11px;letter-spacing:0.12em;color:${C.accent};background:${C.accentGlow};border:1px solid rgba(240,165,0,0.2);padding:3px 10px;}
.page-title{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:22px;letter-spacing:0.04em;}
.page-sub{font-size:12px;color:${C.muted};font-family:'IBM Plex Mono',monospace;margin-left:auto;}
.page-content{padding:36px;max-width:920px;}

/* ── DASHBOARD ── */
.dash-welcome{margin-bottom:32px;}
.dash-greeting{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:32px;letter-spacing:0.04em;margin-bottom:6px;}
.dash-sub{font-size:14px;color:${C.muted};}
.tool-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;}
@media(max-width:700px){.tool-grid{grid-template-columns:1fr;}}
.tool-card{background:${C.surface};border:1px solid ${C.border};padding:22px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;}
.tool-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:transparent;transition:background 0.2s;}
.tool-card:hover{border-color:${C.borderHover};background:${C.surfaceHigh};}
.tool-card:hover::before{background:${C.accent};}
.tool-card-num{font-family:'IBM Plex Mono',monospace;font-size:10px;color:${C.dim};margin-bottom:12px;}
.tool-card-name{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:20px;letter-spacing:0.04em;margin-bottom:8px;}
.tool-card-desc{font-size:13px;color:${C.muted};line-height:1.6;}
.tool-card-arrow{position:absolute;bottom:18px;right:18px;font-family:'IBM Plex Mono',monospace;font-size:14px;color:${C.dim};transition:all 0.2s;}
.tool-card:hover .tool-card-arrow{color:${C.accent};transform:translateX(3px);}
.tool-card-flow{display:flex;align-items:center;gap:8px;margin-top:16px;font-size:11px;color:${C.dim};font-family:'IBM Plex Mono',monospace;}
.flow-pill{background:${C.surfaceHigh};border:1px solid ${C.border};padding:3px 8px;font-size:10px;}
.flow-arrow{color:${C.accent};}
.workflow-banner{background:${C.surfaceHigh};border:1px solid ${C.border};padding:16px 20px;margin-bottom:28px;display:flex;align-items:center;gap:16px;}
.workflow-steps{display:flex;align-items:center;gap:10px;flex:1;}
.wf-step{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:0.06em;color:${C.muted};background:${C.surface};border:1px solid ${C.border};padding:5px 12px;}
.wf-arrow{color:${C.accent};font-family:'IBM Plex Mono',monospace;font-size:12px;}

/* ── AUTH ── */
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
.auth-card{background:${C.surface};border:1px solid ${C.border};border-top:3px solid ${C.accent};padding:40px 44px;width:100%;max-width:420px;}
.auth-logo{text-align:center;margin-bottom:32px;}
.auth-title{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:28px;letter-spacing:0.06em;margin-bottom:4px;}
.auth-sub{font-size:13px;color:${C.muted};}
.auth-divider{text-align:center;font-size:12px;color:${C.dim};margin:18px 0;font-family:'IBM Plex Mono',monospace;}
.auth-switch{text-align:center;font-size:13px;color:${C.muted};margin-top:20px;}
.auth-switch span{color:${C.accent};cursor:pointer;font-weight:600;}
.auth-switch span:hover{color:${C.accentHover};}
.auth-beta-badge{display:inline-block;background:${C.accentGlow};border:1px solid rgba(240,165,0,0.2);color:${C.accent};font-family:'IBM Plex Mono',monospace;font-size:10px;padding:3px 10px;margin-bottom:24px;}

/* ── SCOPE RESULT ── */
.trade-block{background:${C.surface};border:1px solid ${C.border};margin-bottom:14px;overflow:hidden;}
.trade-header{display:flex;align-items:center;gap:14px;padding:12px 18px;background:${C.surfaceHigh};border-bottom:1px solid ${C.border};}
.trade-num{font-family:'IBM Plex Mono',monospace;font-size:10px;color:${C.dim};min-width:22px;}
.trade-name{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;letter-spacing:0.04em;flex:1;}
.trade-badge{font-family:'IBM Plex Mono',monospace;font-size:10px;padding:3px 8px;background:${C.accentGlow};color:${C.accent};border:1px solid rgba(240,165,0,0.25);}
.trade-body{padding:14px 18px;}
.scope-text{font-size:13px;line-height:1.7;color:${C.text};margin-bottom:12px;}
.line-items{display:flex;flex-direction:column;gap:4px;}
.line-item{display:flex;gap:10px;font-size:12px;padding:5px 0;border-bottom:1px solid ${C.border};align-items:flex-start;}
.line-item:last-child{border-bottom:none;}
.line-bullet{color:${C.accent};font-family:'IBM Plex Mono',monospace;font-size:9px;margin-top:4px;flex-shrink:0;}
.line-note{color:${C.muted};font-size:11px;font-style:italic;}
.notes-block{background:${C.surface};border:1px solid ${C.border};padding:18px 22px;margin-bottom:14px;}
.notes-title{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};margin-bottom:10px;}
.notes-list{display:flex;flex-direction:column;gap:6px;}
.notes-item{font-size:12px;color:${C.muted};display:flex;gap:10px;line-height:1.5;}
.notes-item::before{content:'—';color:${C.dim};flex-shrink:0;}
.handoff-banner{background:${C.blueBg};border:1px solid ${C.blueBorder};padding:18px 22px;margin-bottom:22px;display:flex;align-items:center;gap:18px;}

/* ── BID RESULT ── */
.grade-badge{display:inline-block;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;width:44px;height:44px;line-height:44px;text-align:center;border-radius:2px;flex-shrink:0;}
.grade-A{background:rgba(39,174,96,0.15);color:#27ae60;}
.grade-B{background:rgba(74,144,226,0.15);color:#4a90e2;}
.grade-C{background:rgba(240,165,0,0.15);color:${C.accent};}
.grade-D,.grade-F{background:rgba(231,76,60,0.15);color:${C.error};}
.bid-card{background:${C.surface};border:1px solid ${C.border};padding:18px 22px;margin-bottom:14px;display:flex;gap:16px;align-items:flex-start;}
.bid-card.recommended{border-color:${C.accent};border-top:2px solid ${C.accent};}
.bid-card-body{flex:1;}
.bid-name{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:17px;margin-bottom:4px;}
.bid-price{font-family:'IBM Plex Mono',monospace;font-size:15px;color:${C.accent};margin-bottom:8px;}
.bid-flags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.bid-flag{font-size:11px;padding:3px 8px;border-radius:2px;font-family:'IBM Plex Mono',monospace;}
.flag-gap{background:rgba(231,76,60,0.1);color:${C.error};border:1px solid rgba(231,76,60,0.2);}
.flag-ok{background:${C.successBg};color:${C.success};border:1px solid rgba(39,174,96,0.2);}
.flag-note{background:rgba(240,165,0,0.1);color:${C.accent};border:1px solid rgba(240,165,0,0.2);}
.recommended-pill{background:${C.accentGlow};border:1px solid rgba(240,165,0,0.3);color:${C.accent};font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:0.1em;padding:3px 10px;display:inline-block;margin-bottom:8px;}

/* ── CHANGE ORDER ── */
.co-section{background:${C.surface};border:1px solid ${C.border};padding:18px 22px;margin-bottom:14px;}
.co-section-title{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};margin-bottom:12px;}
.co-line{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid ${C.border};font-size:13px;}
.co-line:last-child{border-bottom:none;}
.co-line-desc{flex:1;color:${C.text};}
.co-line-price{font-family:'IBM Plex Mono',monospace;font-size:13px;color:${C.accent};flex-shrink:0;margin-left:16px;}
.co-total{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:2px solid ${C.accent};}
.co-total-label{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;letter-spacing:0.06em;}
.co-total-price{font-family:'IBM Plex Mono',monospace;font-size:22px;color:${C.accent};font-weight:500;}

/* ── GANTT ── */
.gantt-table{width:100%;border-collapse:collapse;font-size:12px;}
.gantt-table th{background:${C.surfaceHigh};font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};padding:8px 12px;border:1px solid ${C.border};text-align:left;}
.gantt-table td{padding:8px 12px;border:1px solid ${C.border};font-size:12px;vertical-align:top;}
.gantt-table tr:hover td{background:${C.surfaceHigh};}
.phase-pill{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:2px 7px;border-radius:2px;}
.sub-table{width:100%;border-collapse:collapse;font-size:12px;}
.sub-table th{background:${C.surfaceHigh};font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};padding:8px 12px;border:1px solid ${C.border};text-align:left;}
.sub-table td{padding:8px 12px;border:1px solid ${C.border};font-size:12px;vertical-align:top;}

/* ── VOICE BUTTON ── */
.voice-btn{display:flex;align-items:center;gap:8px;padding:9px 16px;background:${C.surface};border:1px solid ${C.border};color:${C.muted};font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:0.08em;cursor:pointer;transition:all 0.15s;border-radius:2px;text-transform:uppercase;}
.voice-btn.recording{border-color:${C.error};color:${C.error};background:${C.errorBg};}
.voice-btn:hover{border-color:${C.borderHover};color:${C.text};}
@keyframes recordPulse{0%,100%{box-shadow:0 0 0 0 rgba(231,76,60,0.4);}50%{box-shadow:0 0 0 6px rgba(231,76,60,0);}}
.voice-btn.recording{animation:recordPulse 1.5s infinite;}
`;

// ─── HELPERS ────────────────────────────────────────────────────────────────
function toB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

async function callClaude(messages, system, maxTokens = 4000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.error?.message || `API error ${res.status}`);
  }
  const d = await res.json();
  const raw = d.content.find(b => b.type === "text")?.text || "";
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}

function downloadTxt(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = filename; a.click();
}

function downloadJson(filename, obj) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  a.download = filename; a.click();
}

function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2200); };
  return [msg, show];
}

function useFiles() {
  const [files, setFiles] = useState([]);
  const [b64, setB64] = useState({});
  const add = useCallback(async (newFiles) => {
    const valid = Array.from(newFiles).filter(f => f.type === "application/pdf" || f.type.startsWith("image/"));
    const map = {};
    for (const f of valid) map[f.name] = await toB64(f);
    setB64(prev => ({ ...prev, ...map }));
    setFiles(prev => { const names = new Set(prev.map(f => f.name)); return [...prev, ...valid.filter(f => !names.has(f.name))]; });
  }, []);
  const remove = (name) => { setFiles(p => p.filter(f => f.name !== name)); setB64(p => { const m = { ...p }; delete m[name]; return m; }); };
  const reset = () => { setFiles([]); setB64({}); };
  return { files, b64, add, remove, reset };
}

// Processing steps component
function ProcessingSteps({ steps, idx }) {
  return (
    <div className="processing-wrap fade-up">
      <div className="processing-label">PROCESSING…</div>
      <div className="step-list">
        {steps.map((s, i) => (
          <div key={i} className={`step-row ${i < idx ? "done" : i === idx ? "active" : "pending"}`}>
            <span className="step-dot">{i < idx ? "✓" : i === idx ? "●" : "○"}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// Upload zone component
function UploadZone({ files, b64, onAdd, onRemove, hint = "PDF · JPG · PNG" }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <div
        className={`upload-zone${drag ? " drag" : ""}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onAdd(e.dataTransfer.files); }}
        onClick={() => ref.current?.click()}
      >
        <input ref={ref} type="file" multiple accept=".pdf,image/*" onChange={e => onAdd(e.target.files)} onClick={e => e.stopPropagation()} />
        <div style={{ fontSize: 26, marginBottom: 8 }}>📎</div>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, fontSize: 14, color: C.muted }}>Drop files or click to upload</div>
        <div style={{ fontSize: 11, color: C.dim, fontFamily: "'IBM Plex Mono',monospace", marginTop: 5 }}>{hint}</div>
      </div>
      {files.length > 0 && (
        <div className="file-chips">
          {files.map(f => (
            <div key={f.name} className="file-chip">
              {f.type.startsWith("image/") ? "🖼" : "📄"} {f.name}
              <span className="file-chip-x" onClick={() => onRemove(f.name)}>✕</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── TOOL: SCOPE GPT ─────────────────────────────────────────────────────────
const SCOPE_STEPS = ["Uploading documents…", "Analyzing project scope…", "Building trade breakdown…", "Finalizing scope…"];

function ScopeGPT({ onNavigate }) {
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("Residential Remodel");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();

  const generate = async () => {
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = SCOPE_STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1900));
    try {
      const content = [];
      files.forEach(f => {
        const data = b64[f.name];
        if (!data) return;
        if (f.type.startsWith("image/")) content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
        else content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      });
      content.push({ type: "text", text: `Project: "${projectName}" | Type: ${projectType}\nNotes: ${notes || "None"}\n\nGenerate a complete professional scope of work. Return ONLY valid JSON:\n{"projectName":"string","projectType":"string","projectAddress":"string or null","overview":"string","trades":[{"id":1,"tradeName":"string","contractor":"string","scopeText":"string","lineItems":[{"description":"string","note":"string or null"}]}],"generalConditions":["string"],"exclusions":["string"],"clarifications":["string"],"estimatedDuration":"string","totalLineItemCount":0}` });
      timers.forEach(clearTimeout);
      const r = await callClaude([{ role: "user", content }], "You are an expert GC with 20+ years writing professional scopes of work. Be thorough — 6-12 trades, 3-8 line items each. Return valid JSON only, no markdown.");
      setResult(r); setStatus("done");
    } catch (e) { timers.forEach(clearTimeout); setError(e.message); setStatus("error"); }
  };

  const reset = () => { resetFiles(); setProjectName(""); setNotes(""); setStatus("idle"); setResult(null); setError(""); };

  const toText = (r) => {
    const lines = [`SCOPE OF WORK\n=============\nProject: ${r.projectName}\nType: ${r.projectType}\nDuration: ${r.estimatedDuration}\n\nOVERVIEW\n--------\n${r.overview}\n`];
    r.trades.forEach((t, i) => { lines.push(`${i + 1}. ${t.tradeName.toUpperCase()} [${t.contractor}]\n   ${t.scopeText}`); t.lineItems.forEach(li => lines.push(`   • ${li.description}${li.note ? ` (${li.note})` : ""}`)); lines.push(""); });
    if (r.generalConditions?.length) { lines.push("GENERAL CONDITIONS\n------------------"); r.generalConditions.forEach(g => lines.push(`• ${g}`)); lines.push(""); }
    if (r.exclusions?.length) { lines.push("EXCLUSIONS\n----------"); r.exclusions.forEach(e => lines.push(`• ${e}`)); lines.push(""); }
    if (r.clarifications?.length) { lines.push("CLARIFICATIONS\n--------------"); r.clarifications.forEach(c => lines.push(`• ${c}`)); }
    return lines.join("\n");
  };

  return (
    <div className="fade-up">
      {status === "idle" || status === "error" ? (
        <>
          <div className="section-label">Project Details</div>
          <div className="row-2 input-group">
            <div><label className="field-label">Project Name *</label><input type="text" placeholder="e.g. Johnson Kitchen & Bath Remodel" value={projectName} onChange={e => setProjectName(e.target.value)} /></div>
            <div><label className="field-label">Project Type</label>
              <select value={projectType} onChange={e => setProjectType(e.target.value)}>
                {["Residential Remodel","New Construction","Commercial TI","Addition","Exterior / Roofing","Multi-Family","Light Industrial"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="section-label">Plans & Documents</div>
          <div className="input-group"><UploadZone files={files} b64={b64} onAdd={add} onRemove={remove} /></div>
          <div className="section-label">Project Description</div>
          <div className="input-group"><label className="field-label">Describe the Scope (or let uploads speak for themselves)</label><textarea placeholder="e.g. Full kitchen gut to studs — new layout with island. Primary bath: demo tile, new walk-in shower, double vanity, luxury finishes throughout…" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          {error && <div className="error-box">⚠ {error}</div>}
          <button className="btn btn-primary btn-lg" disabled={!projectName.trim()} onClick={generate}>⚡ Generate Scope of Work</button>
        </>
      ) : status === "loading" ? (
        <ProcessingSteps steps={SCOPE_STEPS} idx={stepIdx} />
      ) : result && (
        <>
          <div className="result-header-card">
            <div className="result-title">{result.projectName}</div>
            <div className="result-meta">{result.projectType}{result.projectAddress ? ` · ${result.projectAddress}` : ""} · {result.estimatedDuration} · {result.totalLineItemCount} line items / {result.trades.length} trades</div>
            <div className="result-actions">
              <button className="btn btn-primary" onClick={() => downloadTxt(`${result.projectName.replace(/\s+/g,"_")}_Scope.txt`, toText(result))}>⬇ Download</button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(toText(result)); showToast("Copied!"); }}>⧉ Copy</button>
              <button className="btn" onClick={() => { downloadJson(`${result.projectName.replace(/\s+/g,"_")}_ScopeExport.json`, result); showToast("Exported!"); }}>🔗 Export → ScheduleGPT</button>
              <button className="btn btn-ghost" onClick={reset}>↩ New Scope</button>
            </div>
          </div>
          <div className="handoff-banner">
            <div style={{ fontSize: 22 }}>🔗</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 14, color: C.blue, marginBottom: 3 }}>Ready to schedule this project?</div>
              <div style={{ fontSize: 12, color: C.muted }}>Export the JSON above and import it in ScheduleGPT to auto-generate your Gantt chart.</div>
            </div>
            <button className="btn" style={{ borderColor: C.blueBorder, color: C.blue }} onClick={() => onNavigate("schedule")}>Open ScheduleGPT →</button>
          </div>
          <div className="section-label">Scope by Trade</div>
          {result.trades.map(t => (
            <div key={t.id} className="trade-block">
              <div className="trade-header"><span className="trade-num">#{String(t.id).padStart(2,"0")}</span><span className="trade-name">{t.tradeName}</span><span className="trade-badge">{t.contractor}</span></div>
              <div className="trade-body">
                <div className="scope-text">{t.scopeText}</div>
                <div className="line-items">{t.lineItems.map((li, i) => <div key={i} className="line-item"><span className="line-bullet">▸</span><div><div>{li.description}</div>{li.note && <div className="line-note">{li.note}</div>}</div></div>)}</div>
              </div>
            </div>
          ))}
          {result.generalConditions?.length > 0 && <><div className="section-label" style={{ marginTop: 22 }}>General Conditions</div><div className="notes-block"><div className="notes-list">{result.generalConditions.map((g, i) => <div key={i} className="notes-item">{g}</div>)}</div></div></>}
          {result.exclusions?.length > 0 && <><div className="section-label">Exclusions</div><div className="notes-block"><div className="notes-list">{result.exclusions.map((e, i) => <div key={i} className="notes-item">{e}</div>)}</div></div></>}
          {result.clarifications?.length > 0 && <><div className="section-label">Clarifications</div><div className="notes-block"><div className="notes-list">{result.clarifications.map((c, i) => <div key={i} className="notes-item">{c}</div>)}</div></div></>}
          <div className="result-actions" style={{ marginTop: 24 }}>
            <button className="btn btn-primary" onClick={() => downloadTxt(`${result.projectName.replace(/\s+/g,"_")}_Scope.txt`, toText(result))}>⬇ Download Scope</button>
            <button className="btn btn-ghost" onClick={reset}>↩ Start Over</button>
          </div>
        </>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

// ─── TOOL: SCHEDULE GPT ──────────────────────────────────────────────────────
const PHASE_COLORS = [
  { bg: "rgba(240,165,0,0.12)", color: "#c47f00" }, { bg: "rgba(74,144,226,0.12)", color: "#4a90e2" },
  { bg: "rgba(39,174,96,0.12)", color: "#27ae60" }, { bg: "rgba(139,92,246,0.12)", color: "#8b5cf6" },
  { bg: "rgba(231,76,60,0.12)", color: "#e74c3c" }, { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
];
const SCHED_STEPS = ["Uploading documents…", "Analyzing scope & phases…", "Building schedule & dependencies…", "Generating subcontractor worksheet…"];

function ScheduleGPT() {
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("remodel");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();

  const generate = async () => {
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = SCHED_STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1800));
    try {
      const content = [];
      files.forEach(f => {
        const data = b64[f.name];
        if (!data) return;
        if (f.type.startsWith("image/")) content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
        else content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      });
      content.push({ type: "text", text: `Project: "${projectName || "Construction Project"}" | Type: ${projectType === "remodel" ? "Remodel/Renovation" : "New Construction"}\n\nAnalyze and return ONLY valid JSON:\n{"projectName":"string","totalDays":0,"phases":["Phase1"],"tasks":[{"id":1,"task":"string","phase":"string","startDay":1,"durationDays":5,"dependencies":[],"trade":"string","notes":"string"}],"subcontractors":[{"trade":"string","phase":"string","estimatedDays":0,"recommendedSubTypes":["string"],"scope":"string"}]}\n\nA full renovation: 15-30 tasks across multiple phases. Keep task names under 50 chars, notes under 60 chars, recommendedSubTypes 2-3 items.` });
      timers.forEach(clearTimeout);
      const r = await callClaude([{ role: "user", content }], `You are an expert construction scheduler. ${projectType === "remodel" ? "Focus on interior trades; only include exterior if documents explicitly call for them." : "Include full sequence: site work, excavation, foundation, framing, exterior, MEP, finishes."} Return valid JSON only.`);
      setResult(r); setStatus("done");
    } catch (e) { timers.forEach(clearTimeout); setError(e.message); setStatus("error"); }
  };

  const reset = () => { resetFiles(); setProjectName(""); setStatus("idle"); setResult(null); setError(""); };

  const phaseMap = {};
  if (result) result.phases.forEach((p, i) => { phaseMap[p] = PHASE_COLORS[i % PHASE_COLORS.length]; });

  const generateExcel = () => {
    if (!result) return;
    const lines = [`PROJECT GANTT CHART — ${result.projectName}\n`];
    lines.push("TASK SCHEDULE");
    lines.push(["#","Task","Phase","Trade","Start Day","Duration","Dependencies","Notes"].join("\t"));
    result.tasks.forEach(t => lines.push([t.id, t.task, t.phase, t.trade, `Day ${t.startDay}`, `${t.durationDays}d`, t.dependencies.join(",") || "—", t.notes || ""].join("\t")));
    lines.push(`\nSUBCONTRACTOR WORKSHEET`);
    lines.push(["Trade","Phase","Est. Days","Sub Types","Scope"].join("\t"));
    result.subcontractors.forEach(s => lines.push([s.trade, s.phase, s.estimatedDays, s.recommendedSubTypes.join(", "), s.scope].join("\t")));
    downloadTxt(`${result.projectName.replace(/\s+/g,"_")}_Gantt.tsv`, lines.join("\n"));
    showToast("Gantt downloaded!");
  };

  return (
    <div className="fade-up">
      {status === "idle" || status === "error" ? (
        <>
          <div className="section-label">Project Info</div>
          <div className="row-2 input-group">
            <div><label className="field-label">Project Name</label><input type="text" placeholder="e.g. Riverside Townhomes Phase 2" value={projectName} onChange={e => setProjectName(e.target.value)} /></div>
            <div><label className="field-label">Project Type</label>
              <select value={projectType} onChange={e => setProjectType(e.target.value)}>
                <option value="remodel">Remodel / Renovation</option>
                <option value="new">New Construction</option>
              </select>
            </div>
          </div>
          <div className="section-label">Upload Construction Documents</div>
          <div className="input-group"><UploadZone files={files} b64={b64} onAdd={add} onRemove={remove} hint="Scope of work, bid, plans, or ScopeGPT JSON export · PDF · Images" /></div>
          {error && <div className="error-box">⚠ {error}</div>}
          <button className="btn btn-primary btn-lg" disabled={files.length === 0 && !projectName.trim()} onClick={generate}>📅 Generate Gantt Chart</button>
        </>
      ) : status === "loading" ? (
        <ProcessingSteps steps={SCHED_STEPS} idx={stepIdx} />
      ) : result && (
        <>
          <div className="stat-row">
            <div className="stat-card"><div className="stat-label">Calendar Days</div><div className="stat-value">{result.totalDays}</div><div className="stat-sub">total duration</div></div>
            <div className="stat-card"><div className="stat-label">Total Tasks</div><div className="stat-value">{result.tasks.length}</div><div className="stat-sub">across {result.phases.length} phases</div></div>
            <div className="stat-card"><div className="stat-label">Trades</div><div className="stat-value">{result.subcontractors.length}</div><div className="stat-sub">subcontractor rows</div></div>
          </div>
          <div className="result-actions" style={{ marginBottom: 22 }}>
            <button className="btn btn-primary" onClick={generateExcel}>⬇ Download Gantt (.TSV)</button>
            <button className="btn btn-ghost" onClick={reset}>↩ New Schedule</button>
          </div>
          <div className="section-label">Schedule Preview</div>
          <div style={{ overflowX: "auto", marginBottom: 24 }}>
            <table className="gantt-table">
              <thead><tr>{["#","Task","Phase","Trade","Start","Days","Deps"].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{result.tasks.slice(0, 20).map(t => {
                const pc = phaseMap[t.phase] || PHASE_COLORS[0];
                return <tr key={t.id}><td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.dim }}>{t.id}</td><td style={{ fontWeight: 600 }}>{t.task}</td><td><span className="phase-pill" style={{ background: pc.bg, color: pc.color }}>{t.phase}</span></td><td style={{ color: C.muted }}>{t.trade}</td><td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>Day {t.startDay}</td><td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>{t.durationDays}d</td><td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.dim }}>{t.dependencies.length ? t.dependencies.join(", ") : "—"}</td></tr>;
              })}</tbody>
            </table>
          </div>
          <div className="section-label">Subcontractor Worksheet</div>
          <div style={{ overflowX: "auto" }}>
            <table className="sub-table">
              <thead><tr>{["Trade","Phase","Est. Days","Sub Types","Scope"].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{result.subcontractors.map((s, i) => <tr key={i}><td style={{ fontWeight: 600 }}>{s.trade}</td><td><span className="phase-pill" style={{ background: (phaseMap[s.phase] || PHASE_COLORS[0]).bg, color: (phaseMap[s.phase] || PHASE_COLORS[0]).color }}>{s.phase}</span></td><td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>{s.estimatedDays}d</td><td style={{ fontSize: 11, color: C.muted }}>{s.recommendedSubTypes.join(", ")}</td><td style={{ fontSize: 11, color: C.muted }}>{s.scope}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

// ─── TOOL: BID MATCH ─────────────────────────────────────────────────────────
const BID_STEPS = ["Uploading bid documents…", "Extracting line items & pricing…", "Running apples-to-apples analysis…", "Generating comparison matrix…"];

function BidMatch() {
  const [bids, setBids] = useState([{ name: "", files: [], b64: {} }, { name: "", files: [], b64: {} }]);
  const [projectDesc, setProjectDesc] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();

  const addBid = () => { if (bids.length < 5) setBids(p => [...p, { name: "", files: [], b64: {} }]); };
  const removeBid = (i) => { if (bids.length > 2) setBids(p => p.filter((_, idx) => idx !== i)); };
  const updateName = (i, v) => setBids(p => p.map((b, idx) => idx === i ? { ...b, name: v } : b));
  const addFiles = async (i, newFiles) => {
    const valid = Array.from(newFiles).filter(f => f.type === "application/pdf" || f.type.startsWith("image/") || f.type.includes("word") || f.name.endsWith(".docx"));
    const map = {};
    for (const f of valid) map[f.name] = await toB64(f);
    setBids(p => p.map((b, idx) => idx === i ? { ...b, files: [...b.files, ...valid.filter(f => !b.files.find(e => e.name === f.name))], b64: { ...b.b64, ...map } } : b));
  };
  const removeFile = (bidIdx, name) => setBids(p => p.map((b, i) => i === bidIdx ? { ...b, files: b.files.filter(f => f.name !== name), b64: Object.fromEntries(Object.entries(b.b64).filter(([k]) => k !== name)) } : b));

  const generate = async () => {
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = BID_STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 2000));
    try {
      const content = [];
      bids.forEach((bid, bi) => {
        content.push({ type: "text", text: `\n--- BID ${bi + 1}: ${bid.name || `Contractor ${bi + 1}`} ---` });
        bid.files.forEach(f => {
          const data = bid.b64[f.name];
          if (!data) return;
          if (f.type.startsWith("image/")) content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
          else content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
        });
      });
      content.push({ type: "text", text: `Project: ${projectDesc || "As described in bid documents"}\n\nAnalyze all bids and return ONLY valid JSON:\n{"projectSummary":"string","recommendedBidIndex":0,"analysis":{"totalBids":0,"pricingRange":{"low":0,"high":0},"averagePrice":0},"bids":[{"bidIndex":0,"contractorName":"string","totalPrice":0,"normalizedPrice":0,"grade":"A","summary":"string","scopeFlags":["string"],"inclusions":["string"],"exclusions":["string"],"redFlags":["string"],"strengths":["string"]}],"scopeGaps":["string"],"recommendation":"string"}` });
      timers.forEach(clearTimeout);
      const r = await callClaude([{ role: "user", content }], "You are an expert construction cost estimator and procurement specialist. Analyze bids objectively. Grade A=excellent B=good C=average D=below average F=poor. Return valid JSON only, no markdown.", 5000);
      setResult(r); setStatus("done");
    } catch (e) { timers.forEach(clearTimeout); setError(e.message); setStatus("error"); }
  };

  const reset = () => { setBids([{ name: "", files: [], b64: {} }, { name: "", files: [], b64: {} }]); setProjectDesc(""); setStatus("idle"); setResult(null); setError(""); };
  const canGenerate = bids.filter(b => b.files.length > 0 || b.name.trim()).length >= 2;

  const fmtPrice = (p) => p ? `$${Number(p).toLocaleString()}` : "N/A";

  return (
    <div className="fade-up">
      {status === "idle" || status === "error" ? (
        <>
          <div className="section-label">Project Description</div>
          <div className="input-group"><label className="field-label">What are these bids for?</label><textarea placeholder="e.g. Full kitchen and primary bath remodel — approx 400 SF. Scope includes demo, framing, electrical, plumbing, tile, cabinets, and finishes." value={projectDesc} onChange={e => setProjectDesc(e.target.value)} style={{ minHeight: 80 }} /></div>
          <div className="section-label">Contractor Bids</div>
          {bids.map((bid, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "18px 20px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, color: C.accent, background: C.accentGlow, padding: "3px 10px", border: `1px solid rgba(240,165,0,0.2)` }}>BID {i + 1}</div>
                <input type="text" placeholder={`Contractor ${i + 1} name`} value={bid.name} onChange={e => updateName(i, e.target.value)} style={{ flex: 1 }} />
                {bids.length > 2 && <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => removeBid(i)}>✕</button>}
              </div>
              <UploadZone files={bid.files} b64={bid.b64} onAdd={f => addFiles(i, f)} onRemove={n => removeFile(i, n)} hint="PDF or Word bid document" />
            </div>
          ))}
          {bids.length < 5 && <button className="btn" style={{ marginBottom: 22 }} onClick={addBid}>+ Add Another Bid</button>}
          {error && <div className="error-box">⚠ {error}</div>}
          <button className="btn btn-primary btn-lg" disabled={!canGenerate} onClick={generate}>⚖ Analyze Bids</button>
        </>
      ) : status === "loading" ? (
        <ProcessingSteps steps={BID_STEPS} idx={stepIdx} />
      ) : result && (
        <>
          <div className="result-header-card">
            <div className="result-title">Bid Analysis Complete</div>
            <div className="result-meta">{result.analysis.totalBids} bids · Range: {fmtPrice(result.analysis.pricingRange.low)} – {fmtPrice(result.analysis.pricingRange.high)} · Avg: {fmtPrice(result.analysis.averagePrice)}</div>
            <div className="result-actions">
              <button className="btn" onClick={() => { navigator.clipboard.writeText(result.recommendation); showToast("Recommendation copied!"); }}>⧉ Copy Recommendation</button>
              <button className="btn btn-ghost" onClick={reset}>↩ New Analysis</button>
            </div>
          </div>
          <div className="stat-row">
            <div className="stat-card"><div className="stat-label">Bids Analyzed</div><div className="stat-value">{result.analysis.totalBids}</div></div>
            <div className="stat-card"><div className="stat-label">Price Range</div><div className="stat-value" style={{ fontSize: 18 }}>{fmtPrice(result.analysis.pricingRange.low)}–{fmtPrice(result.analysis.pricingRange.high)}</div></div>
            <div className="stat-card"><div className="stat-label">Recommended</div><div className="stat-value" style={{ fontSize: 18 }}>{result.bids[result.recommendedBidIndex]?.contractorName || "—"}</div></div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.accent}`, borderTop: `3px solid ${C.accent}`, padding: "16px 20px", marginBottom: 22 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>AI Recommendation</div>
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>{result.recommendation}</div>
          </div>
          <div className="section-label">Bid Comparison</div>
          {result.bids.map((bid, i) => (
            <div key={i} className={`bid-card${i === result.recommendedBidIndex ? " recommended" : ""}`}>
              <div className={`grade-badge grade-${bid.grade}`}>{bid.grade}</div>
              <div className="bid-card-body">
                {i === result.recommendedBidIndex && <div className="recommended-pill">★ RECOMMENDED</div>}
                <div className="bid-name">{bid.contractorName}</div>
                <div className="bid-price">{fmtPrice(bid.totalPrice)} total · {fmtPrice(bid.normalizedPrice)} normalized</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 10 }}>{bid.summary}</div>
                <div className="bid-flags">
                  {bid.redFlags?.map((f, j) => <span key={j} className="bid-flag flag-gap">⚠ {f}</span>)}
                  {bid.strengths?.map((f, j) => <span key={j} className="bid-flag flag-ok">✓ {f}</span>)}
                  {bid.exclusions?.map((f, j) => <span key={j} className="bid-flag flag-note">— {f}</span>)}
                </div>
              </div>
            </div>
          ))}
          {result.scopeGaps?.length > 0 && <><div className="section-label" style={{ marginTop: 22 }}>Scope Gaps Across All Bids</div><div className="notes-block"><div className="notes-list">{result.scopeGaps.map((g, i) => <div key={i} className="notes-item">{g}</div>)}</div></div></>}
        </>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

// ─── TOOL: CHANGE ORDER GPT ──────────────────────────────────────────────────
const CO_STEPS = ["Processing description…", "Calculating cost breakdown…", "Writing contract language…", "Finalizing change order…"];

function ChangeOrderGPT() {
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [coNumber, setCoNumber] = useState("001");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);

  const toggleVoice = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) { alert("Speech recognition not supported in this browser."); return; }
    if (isRecording) { shouldListenRef.current = false; recognitionRef.current?.stop(); setIsRecording(false); return; }
    shouldListenRef.current = true;
    setIsRecording(true);
    const startListening = () => {
      if (!shouldListenRef.current) return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new SR();
      recognitionRef.current = r;
      r.continuous = false; r.interimResults = false; r.lang = "en-US";
      r.onresult = (e) => { const t = e.results[0][0].transcript; setDescription(prev => prev ? prev + " " + t : t); };
      r.onend = () => { if (shouldListenRef.current) setTimeout(startListening, 100); else setIsRecording(false); };
      r.onerror = () => { if (shouldListenRef.current) setTimeout(startListening, 200); };
      r.start();
    };
    startListening();
  };

  const generate = async () => {
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = CO_STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1700));
    try {
      const content = [];
      files.forEach(f => {
        const data = b64[f.name];
        if (!data) return;
        if (f.type.startsWith("image/")) content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
        else content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      });
      content.push({ type: "text", text: `Project: "${projectName}" | Client: "${clientName}" | CO #${coNumber}\nChange Description: ${description}\n\nGenerate a complete change order. Return ONLY valid JSON:\n{"changeOrderNumber":"string","projectName":"string","clientName":"string","date":"string","title":"string","description":"string","reason":"string","lineItems":[{"trade":"string","description":"string","quantity":1,"unit":"string","unitPrice":0,"totalPrice":0}],"subtotal":0,"overhead":0,"profit":0,"totalAmount":0,"daysAdded":0,"contractLanguage":"string","notes":"string"}` });
      timers.forEach(clearTimeout);
      const r = await callClaude([{ role: "user", content }], "You are an expert construction project manager writing professional change orders. Be specific with line items and pricing. Use current market rates. Return valid JSON only.");
      setResult(r); setStatus("done");
    } catch (e) { timers.forEach(clearTimeout); setError(e.message); setStatus("error"); }
  };

  const reset = () => { resetFiles(); setProjectName(""); setClientName(""); setDescription(""); setStatus("idle"); setResult(null); setError(""); };
  const fmtPrice = (p) => `$${Number(p || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const toText = (r) => [
    `CHANGE ORDER #${r.changeOrderNumber}`,
    `================`,
    `Project: ${r.projectName}`,
    `Client: ${r.clientName}`,
    `Date: ${r.date}`,
    `Title: ${r.title}`,
    ``,
    `DESCRIPTION`,
    r.description,
    ``,
    `REASON FOR CHANGE`,
    r.reason,
    ``,
    `COST BREAKDOWN`,
    r.lineItems.map(li => `  ${li.trade} — ${li.description}: ${li.quantity} ${li.unit} @ ${fmtPrice(li.unitPrice)} = ${fmtPrice(li.totalPrice)}`).join("\n"),
    ``,
    `Subtotal: ${fmtPrice(r.subtotal)}`,
    `Overhead: ${fmtPrice(r.overhead)}`,
    `Profit: ${fmtPrice(r.profit)}`,
    `TOTAL: ${fmtPrice(r.totalAmount)}`,
    `Schedule Impact: +${r.daysAdded} days`,
    ``,
    `CONTRACT LANGUAGE`,
    r.contractLanguage,
  ].join("\n");

  return (
    <div className="fade-up">
      {status === "idle" || status === "error" ? (
        <>
          <div className="section-label">Project Info</div>
          <div className="row-3 input-group">
            <div><label className="field-label">Project Name</label><input type="text" placeholder="Oak Valley Renovation" value={projectName} onChange={e => setProjectName(e.target.value)} /></div>
            <div><label className="field-label">Client Name</label><input type="text" placeholder="Johnson Family" value={clientName} onChange={e => setClientName(e.target.value)} /></div>
            <div><label className="field-label">CO Number</label><input type="text" placeholder="001" value={coNumber} onChange={e => setCoNumber(e.target.value)} /></div>
          </div>
          <div className="section-label">What Changed</div>
          <div className="input-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label className="field-label" style={{ margin: 0 }}>Describe the Change *</label>
              <button className={`voice-btn${isRecording ? " recording" : ""}`} onClick={toggleVoice}>{isRecording ? "⏹ Stop Recording" : "🎤 Voice Input"}</button>
            </div>
            <textarea placeholder="e.g. Client requested to upgrade from LVP to hardwood flooring in all three bedrooms. Also adding under-cabinet lighting in kitchen — wasn't in original scope." value={description} onChange={e => setDescription(e.target.value)} style={{ minHeight: 130 }} />
          </div>
          <div className="section-label">Supporting Photos / Docs</div>
          <div className="input-group"><UploadZone files={files} b64={b64} onAdd={add} onRemove={remove} hint="Photos of change conditions, spec sheets, written requests" /></div>
          {error && <div className="error-box">⚠ {error}</div>}
          <button className="btn btn-primary btn-lg" disabled={!description.trim()} onClick={generate}>📋 Generate Change Order</button>
        </>
      ) : status === "loading" ? (
        <ProcessingSteps steps={CO_STEPS} idx={stepIdx} />
      ) : result && (
        <>
          <div className="result-header-card">
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.muted, marginBottom: 4 }}>CHANGE ORDER #{result.changeOrderNumber} · {result.date}</div>
            <div className="result-title">{result.title}</div>
            <div className="result-meta">{result.projectName} · {result.clientName} · +{result.daysAdded} days schedule impact</div>
            <div className="result-actions">
              <button className="btn btn-primary" onClick={() => downloadTxt(`CO_${result.changeOrderNumber}_${result.projectName.replace(/\s+/g,"_")}.txt`, toText(result))}>⬇ Download CO</button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(toText(result)); showToast("Copied!"); }}>⧉ Copy</button>
              <button className="btn btn-ghost" onClick={reset}>↩ New CO</button>
            </div>
          </div>
          <div className="stat-row">
            <div className="stat-card"><div className="stat-label">Total Amount</div><div className="stat-value" style={{ fontSize: 22 }}>{`$${Number(result.totalAmount).toLocaleString()}`}</div></div>
            <div className="stat-card"><div className="stat-label">Line Items</div><div className="stat-value">{result.lineItems.length}</div></div>
            <div className="stat-card"><div className="stat-label">Schedule Impact</div><div className="stat-value">+{result.daysAdded}d</div></div>
          </div>
          <div className="co-section">
            <div className="co-section-title">Description</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{result.description}</div>
            <div className="co-section-title">Reason for Change</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: C.muted }}>{result.reason}</div>
          </div>
          <div className="co-section">
            <div className="co-section-title">Cost Breakdown</div>
            {result.lineItems.map((li, i) => (
              <div key={i} className="co-line">
                <div>
                  <div className="co-line-desc">{li.description}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono',monospace" }}>{li.trade} · {li.quantity} {li.unit} @ {`$${Number(li.unitPrice).toLocaleString()}`}</div>
                </div>
                <div className="co-line-price">{`$${Number(li.totalPrice).toLocaleString()}`}</div>
              </div>
            ))}
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {[["Subtotal", result.subtotal], ["Overhead", result.overhead], ["Profit", result.profit]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted }}><span>{l}</span><span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{`$${Number(v).toLocaleString()}`}</span></div>
              ))}
            </div>
            <div className="co-total"><span className="co-total-label">TOTAL CHANGE ORDER AMOUNT</span><span className="co-total-price">{`$${Number(result.totalAmount).toLocaleString()}`}</span></div>
          </div>
          <div className="co-section">
            <div className="co-section-title">Contract Language</div>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: C.muted, fontStyle: "italic" }}>{result.contractLanguage}</div>
          </div>
          {result.notes && <div className="co-section"><div className="co-section-title">Notes</div><div style={{ fontSize: 13, color: C.muted }}>{result.notes}</div></div>}
        </>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
const TOOLS = [
  { id: "scope", name: "ScopeGPT", badge: "01", desc: "Describe or upload plans → professional scope of work broken down by trade with line items.", flow: ["Text / Plans", "→", "Scope Doc"] },
  { id: "schedule", name: "ScheduleGPT", badge: "02", desc: "Upload scope or docs → complete Gantt chart with phases, dependencies, and sub worksheet.", flow: ["Scope / Docs", "→", "Gantt Chart"] },
  { id: "bidmatch", name: "BidMatch", badge: "03", desc: "Upload up to 5 contractor bids → apples-to-apples matrix with grades and award recommendation.", flow: ["Up to 5 Bids", "→", "Comparison"] },
  { id: "changeorder", name: "ChangeOrderGPT", badge: "04", desc: "Describe what changed via text or voice → formatted change order with cost breakdown and contract language.", flow: ["Description", "→", "Change Order"] },
];

function Dashboard({ user, onNavigate }) {
  return (
    <div className="fade-up">
      <div className="dash-welcome">
        <div className="dash-greeting">Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</div>
        <div className="dash-sub">Your AI-powered construction toolkit. Pick a tool or follow the workflow below.</div>
      </div>
      <div className="workflow-banner">
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginRight: 4, whiteSpace: "nowrap" }}>Project Workflow</div>
        <div className="workflow-steps">
          {["ScopeGPT", "→", "ScheduleGPT", "→", "BidMatch", "→", "ChangeOrderGPT"].map((s, i) =>
            s === "→" ? <span key={i} className="wf-arrow">{s}</span> : <span key={i} className="wf-step">{s}</span>
          )}
        </div>
      </div>
      <div className="tool-grid">
        {TOOLS.map(t => (
          <div key={t.id} className="tool-card" onClick={() => onNavigate(t.id)}>
            <div className="tool-card-num">{t.badge} / 04</div>
            <div className="tool-card-name">{t.name}</div>
            <div className="tool-card-desc">{t.desc}</div>
            <div className="tool-card-flow">{t.flow.map((f, i) => f === "→" ? <span key={i} className="flow-arrow">{f}</span> : <span key={i} className="flow-pill">{f}</span>)}</div>
            <div className="tool-card-arrow">→</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const BETA_CODE = "JOBSITE2026";

  const submit = async () => {
    setError(""); setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    if (mode === "register") {
      if (code.toUpperCase() !== BETA_CODE) { setError("Invalid beta access code. Contact your JobSiteGPT rep."); setLoading(false); return; }
      if (!name.trim() || !email.trim() || !password.trim()) { setError("All fields required."); setLoading(false); return; }
      const users = JSON.parse(localStorage.getItem("jsg_users") || "{}");
      if (users[email]) { setError("Account already exists. Sign in instead."); setLoading(false); return; }
      users[email] = { name, password };
      localStorage.setItem("jsg_users", JSON.stringify(users));
      onAuth({ name, email });
    } else {
      if (!email.trim() || !password.trim()) { setError("Email and password required."); setLoading(false); return; }
      const users = JSON.parse(localStorage.getItem("jsg_users") || "{}");
      if (!users[email] || users[email].password !== password) { setError("Invalid credentials."); setLoading(false); return; }
      onAuth({ name: users[email].name, email });
    }
    setLoading(false);
  };

  return (
    <div className="auth-wrap fade-up">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ marginBottom: 6 }}><span className="logo-badge">JOBSITEGPT</span></div>
          <div className="logo-title">Construction AI Suite</div>
          <div style={{ marginTop: 14 }}><span className="auth-beta-badge">BETA ACCESS</span></div>
        </div>
        <div className="auth-title">{mode === "login" ? "Sign In" : "Create Account"}</div>
        <div className="auth-sub" style={{ marginBottom: 24 }}>{mode === "login" ? "Access your construction AI tools." : "Register with your beta access code."}</div>
        {mode === "register" && (
          <div className="input-group">
            <label className="field-label">Full Name</label>
            <input type="text" placeholder="Mike Johnson" value={name} onChange={e => setName(e.target.value)} />
          </div>
        )}
        <div className="input-group">
          <label className="field-label">Email</label>
          <input type="email" placeholder="mike@johnsonbuilds.com" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="field-label">Password</label>
          <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        {mode === "register" && (
          <div className="input-group">
            <label className="field-label">Beta Access Code</label>
            <input type="text" placeholder="XXXXXXXX" value={code} onChange={e => setCode(e.target.value)} />
          </div>
        )}
        {error && <div className="error-box" style={{ marginBottom: 14 }}>⚠ {error}</div>}
        <button className="btn btn-primary btn-lg" disabled={loading} onClick={submit}>
          {loading ? "…" : mode === "login" ? "Sign In →" : "Create Account →"}
        </button>
        <div className="auth-switch" style={{ marginTop: 18 }}>
          {mode === "login" ? <>No account? <span onClick={() => { setMode("register"); setError(""); }}>Request beta access</span></> : <>Have an account? <span onClick={() => { setMode("login"); setError(""); }}>Sign in</span></>}
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "scope", label: "ScopeGPT", icon: "📋" },
  { id: "schedule", label: "ScheduleGPT", icon: "📅" },
  { id: "bidmatch", label: "BidMatch", icon: "⚖" },
  { id: "changeorder", label: "ChangeOrderGPT", icon: "✏" },
];

function Sidebar({ active, user, onNavigate, onLogout }) {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div><span className="logo-badge">JOBSITEGPT</span></div>
        <div className="logo-title">JobSiteGPT</div>
        <div className="logo-sub">Construction AI Suite</div>
      </div>
      <div className="nav-section-title">Tools</div>
      {NAV.map(item => (
        <div key={item.id} className={`nav-item${active === item.id ? " active" : ""}`} onClick={() => onNavigate(item.id)}>
          <span className="nav-item-icon">{item.icon}</span>
          {item.label}
        </div>
      ))}
      <div className="nav-footer">
        <div className="nav-user">{user?.email || "Beta User"}</div>
        <button className="btn btn-ghost" style={{ marginTop: 8, padding: "6px 0", fontSize: 11, width: "100%", justifyContent: "flex-start" }} onClick={onLogout}>Sign Out</button>
      </div>
    </div>
  );
}

// ─── PAGE HEADER ─────────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard: { badge: "HOME", title: "Dashboard", sub: "JobSiteGPT Beta" },
  scope: { badge: "01 / 04", title: "ScopeGPT", sub: "Scope of Work Generator" },
  schedule: { badge: "02 / 04", title: "ScheduleGPT", sub: "Gantt Chart Generator" },
  bidmatch: { badge: "03 / 04", title: "BidMatch", sub: "Bid Leveler & Comparison" },
  changeorder: { badge: "04 / 04", title: "ChangeOrderGPT", sub: "Change Order Writer" },
};

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try { const u = sessionStorage.getItem("jsg_user"); return u ? JSON.parse(u) : null; } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");

  const login = (u) => { sessionStorage.setItem("jsg_user", JSON.stringify(u)); setUser(u); };
  const logout = () => { sessionStorage.removeItem("jsg_user"); setUser(null); setPage("dashboard"); };
  const navigate = (p) => setPage(p);

  const meta = PAGE_META[page] || PAGE_META.dashboard;

  if (!user) return (
    <>
      <style>{CSS}</style>
      <Auth onAuth={login} />
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <Sidebar active={page} user={user} onNavigate={navigate} onLogout={logout} />
      <div className="main-wrap">
        <div className="page-header">
          <span className="page-title-badge">{meta.badge}</span>
          <span className="page-title">{meta.title}</span>
          <span className="page-sub">{meta.sub}</span>
        </div>
        <div className="page-content">
          {page === "dashboard" && <Dashboard user={user} onNavigate={navigate} />}
          {page === "scope" && <ScopeGPT onNavigate={navigate} />}
          {page === "schedule" && <ScheduleGPT />}
          {page === "bidmatch" && <BidMatch />}
          {page === "changeorder" && <ChangeOrderGPT />}
        </div>
      </div>
    </>
  );
}
