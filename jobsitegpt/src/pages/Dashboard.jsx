import { useNavigate } from "react-router-dom";

const TOOLS = [
  {
    to: "/scope",
    name: "ScopeGPT",
    badge: "01",
    desc: "Describe your project or upload plans → professional scope of work broken down by trade with line items.",
    flow: ["Text / Plans", "→", "Scope Doc"],
  },
  {
    to: "/schedule",
    name: "ScheduleGPT",
    badge: "02",
    desc: "Upload scope or docs → complete Gantt chart with phases, dependencies, and subcontractor worksheet.",
    flow: ["Scope / Docs", "→", "Gantt Chart"],
  },
  {
    to: "/bidmatch",
    name: "BidMatch",
    badge: "03",
    desc: "Upload up to 5 contractor bids → apples-to-apples comparison matrix with letter grades and award recommendation.",
    flow: ["Up to 5 Bids", "→", "Comparison"],
  },
  {
    to: "/changeorder",
    name: "ChangeOrderGPT",
    badge: "04",
    desc: "Describe what changed via text or voice → formatted change order with cost breakdown and contract language.",
    flow: ["Voice / Text", "→", "Change Order"],
  },
  {
    to: "/fieldledger",
    name: "FieldLedger",
    badge: "05",
    desc: "Log job costs as you go — cash, card, check, whatever. Voice entry, AI cost codes, live reconciliation.",
    flow: ["Log Expenses", "→", "Reconciliation"],
  },
];

const WF = ["ScopeGPT", "→", "ScheduleGPT", "→", "BidMatch", "→", "ChangeOrderGPT", "→", "FieldLedger"];

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const firstName = user?.user_metadata?.name?.split(" ")[0] || user?.email?.split("@")[0] || "";

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: "0.04em", marginBottom: 6, color: "#1a1f2e" }}>
          Welcome back{firstName ? `, ${firstName}` : ""}.
        </div>
        <div style={{ fontSize: 14, color: "#606880" }}>
          Your AI-powered construction toolkit. Five tools, one workflow.
        </div>
      </div>

      {/* Projects CTA */}
      <div
        onClick={() => navigate("/projects")}
        style={{ background: "#ffffff", border: "1.5px solid #e0e4ef", borderLeft: "4px solid #f0a500", padding: "16px 20px", marginBottom: 24, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, borderRadius: "0 8px 8px 0", transition: "all 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#c0c8d8"}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0e4ef"; e.currentTarget.style.borderLeftColor = "#f0a500"; }}
      >
        <div style={{ fontSize: 24 }}>📁</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1f2e", marginBottom: 2 }}>Start with a Project</div>
          <div style={{ fontSize: 13, color: "#606880" }}>Set up your project details once — client info, address, contract type — and every tool reads from it automatically.</div>
        </div>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, color: "#c0c8d8" }}>→</div>
      </div>

      {/* Workflow banner */}
      <div className="workflow-banner">
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#909ab0", letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Project Workflow
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {WF.map((s, i) =>
            s === "→"
              ? <span key={i} className="wf-arrow">{s}</span>
              : <span key={i} className="wf-step">{s}</span>
          )}
        </div>
      </div>

      {/* Tool grid */}
      <div className="tool-grid">
        {TOOLS.map((t) => (
          <div key={t.to} className="tool-card" onClick={() => navigate(t.to)}>
            <div className="tool-card-num">{t.badge} / 05</div>
            <div className="tool-card-name">{t.name}</div>
            <div className="tool-card-desc">{t.desc}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#c0c8d8" }}>
              {t.flow.map((f, i) =>
                f === "→"
                  ? <span key={i} style={{ color: "#f0a500" }}>{f}</span>
                  : <span key={i} className="wf-step">{f}</span>
              )}
            </div>
            <div className="tool-card-arrow">→</div>
          </div>
        ))}
      </div>
    </div>
  );
}