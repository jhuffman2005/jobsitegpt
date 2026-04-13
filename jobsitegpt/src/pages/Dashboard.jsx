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
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: "0.04em", marginBottom: 6 }}>
          Welcome back{firstName ? `, ${firstName}` : ""}.
        </div>
        <div style={{ fontSize: 14, color: "#6b7599" }}>
          Your AI-powered construction toolkit. Five tools, one workflow.
        </div>
      </div>

      {/* Workflow banner */}
      <div className="workflow-banner">
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#6b7599", letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#3a4260" }}>
              {t.flow.map((f, i) =>
                f === "→"
                  ? <span key={i} style={{ color: "#f0a500" }}>{f}</span>
                  : <span key={i} style={{ background: "#1a2030", border: "1px solid #252d42", padding: "3px 8px", fontSize: 10 }}>{f}</span>
              )}
            </div>
            <div className="tool-card-arrow">→</div>
          </div>
        ))}
      </div>
    </div>
  );
}
