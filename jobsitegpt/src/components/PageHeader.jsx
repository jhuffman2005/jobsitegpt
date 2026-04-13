const META = {
  "/":            { badge: "HOME",    title: "Dashboard",      sub: "JobSiteGPT Beta" },
  "/scope":       { badge: "01 / 05", title: "ScopeGPT",       sub: "Scope of Work Generator" },
  "/schedule":    { badge: "02 / 05", title: "ScheduleGPT",    sub: "Gantt Chart Generator" },
  "/bidmatch":    { badge: "03 / 05", title: "BidMatch",       sub: "Bid Leveler & Comparison" },
  "/changeorder": { badge: "04 / 05", title: "ChangeOrderGPT", sub: "Change Order Writer" },
  "/fieldledger": { badge: "05 / 05", title: "FieldLedger",    sub: "AI Job Cost Ledger" },
};

export default function PageHeader({ pathname }) {
  const meta = META[pathname] || META["/"];
  return (
    <div className="page-header">
      <span className="page-title-badge">{meta.badge}</span>
      <span className="page-title">{meta.title}</span>
      <span className="page-sub">{meta.sub}</span>
    </div>
  );
}
