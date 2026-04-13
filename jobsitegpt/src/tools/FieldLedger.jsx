import { useState, useCallback } from "react";
import { callClaude, downloadTxt } from "../lib/api";
import { useToast, useVoiceInput } from "../lib/hooks";
import ProjectSwitcher from "../components/ProjectSwitcher";

const DEFAULT_COST_CODES = [
  "Demolition","Site Work","Concrete","Framing","Roofing","Exterior",
  "Windows & Doors","Plumbing","Electrical","HVAC","Insulation","Drywall",
  "Tile","Flooring","Cabinets","Countertops","Painting","Trim & Finish",
  "Fixtures & Hardware","Landscaping","Permits & Fees","Equipment Rental",
  "Labor","Cleanup","Miscellaneous",
];

const PAYMENT_TYPES = ["Cash","Personal Card","Business Card","Debit","Check","Zelle / Venmo","Other"];

const fmt = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

export default function FieldLedger({ activeProject, onProjectChange }) {
  const [jobs, setJobs] = useState(() => load("fl_jobs", []));
  const [entries, setEntries] = useState(() => load("fl_entries", []));
  const [payments, setPayments] = useState(() => load("fl_payments", []));
  const [budgets, setBudgets] = useState(() => load("fl_budgets", {}));
  const [activeJob, setActiveJob] = useState("");
  const [tab, setTab] = useState("log");
  const [budgetMode, setBudgetMode] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [toast, showToast] = useToast();

  const [newJobName, setNewJobName] = useState("");
  const [newJobClient, setNewJobClient] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [logPayee, setLogPayee] = useState("");
  const [logCode, setLogCode] = useState("");
  const [logPay, setLogPay] = useState("Cash");
  const [logAmt, setLogAmt] = useState("");
  const [logDesc, setLogDesc] = useState("");
  const [acList, setAcList] = useState([]);
  const [acIdx, setAcIdx] = useState(-1);
  const [voiceText, setVoiceText] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [payLabel, setPayLabel] = useState("");
  const [payAmt, setPayAmt] = useState("");

  const { isRecording, toggle: toggleVoice } = useVoiceInput((t) =>
    setVoiceText((prev) => (prev ? prev + " " + t : t))
  );

  const persist = useCallback((j, e, p, b) => {
    setJobs(j); setEntries(e); setPayments(p); setBudgets(b);
    localStorage.setItem("fl_jobs", JSON.stringify(j));
    localStorage.setItem("fl_entries", JSON.stringify(e));
    localStorage.setItem("fl_payments", JSON.stringify(p));
    localStorage.setItem("fl_budgets", JSON.stringify(b));
  }, []);

  const addJob = () => {
    if (!newJobName.trim()) return;
    const name = newJobName.trim() || activeProject?.name || "";
    const client = newJobClient.trim() || activeProject?.client_name || "";
    const j = { id: Date.now().toString(), name, client, created: new Date().toISOString() };
    const updated = [...jobs, j];
    persist(updated, entries, payments, budgets);
    setActiveJob(j.id); setNewJobName(""); setNewJobClient(""); setShowNewJob(false);
    showToast("Job created!");
  };

  const allCodes = useCallback(() => {
    const used = [...new Set(entries.map((e) => e.code))];
    return [...new Set([...used, ...DEFAULT_COST_CODES])].sort();
  }, [entries]);

  const onCodeInput = (val) => {
    setLogCode(val);
    if (!val.trim()) { setAcList([]); return; }
    setAcList(allCodes().filter((c) => c.toLowerCase().includes(val.toLowerCase())).slice(0, 8));
    setAcIdx(-1);
  };

  const onCodeKey = (e) => {
    if (!acList.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAcIdx((i) => Math.min(i + 1, acList.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAcIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && acIdx >= 0) { e.preventDefault(); setLogCode(acList[acIdx]); setAcList([]); }
    else if (e.key === "Escape") setAcList([]);
  };

  const logExpense = () => {
    if (!activeJob || !logCode.trim() || !logAmt) return;
    const e = { id: Date.now().toString(), jobId: activeJob, date: logDate, payee: logPayee, code: logCode, pay: logPay, amount: parseFloat(logAmt), desc: logDesc };
    persist(jobs, [...entries, e], payments, budgets);
    setLogPayee(""); setLogCode(""); setLogAmt(""); setLogDesc(""); setAcList([]);
    showToast("Expense logged!");
  };

  const deleteEntry = (id) => persist(jobs, entries.filter((e) => e.id !== id), payments, budgets);

  const parseVoice = async () => {
    if (!voiceText.trim()) return;
    setVoiceStatus("Parsing…");
    try {
      const r = await callClaude(
        [{ role: "user", content: `Parse this expense into JSON only, no markdown:\n"${voiceText}"\nReturn: {"payee":"string","amount":0,"code":"string","pay":"Cash","desc":"string"}\ncode: pick the closest from ${DEFAULT_COST_CODES.join(", ")}\npay: one of ${PAYMENT_TYPES.join(", ")}` }],
        "You parse expense descriptions into structured JSON. Return valid JSON only, no markdown.",
        400
      );
      if (r.payee) setLogPayee(r.payee);
      if (r.amount) setLogAmt(String(r.amount));
      if (r.code) setLogCode(r.code);
      if (r.pay) setLogPay(r.pay);
      if (r.desc) setLogDesc(r.desc);
      setVoiceText(""); setVoiceStatus("✓ Fields filled — review and confirm.");
    } catch { setVoiceStatus("Could not parse — fill in manually."); }
  };

  const addPayment = () => {
    if (!activeJob || !payAmt) return;
    const p = { id: Date.now().toString(), jobId: activeJob, label: payLabel || "Payment", amount: parseFloat(payAmt), date: new Date().toISOString().split("T")[0] };
    persist(jobs, entries, [...payments, p], budgets);
    setPayLabel(""); setPayAmt(""); showToast("Payment recorded!");
  };

  const exportRecon = () => {
    const job = jobs.find((j) => j.id === activeJob);
    if (!job) return;
    const jobEntries = entries.filter((e) => e.jobId === activeJob);
    const byCode = {};
    jobEntries.forEach((e) => { byCode[e.code] = (byCode[e.code] || 0) + e.amount; });
    const total = Object.values(byCode).reduce((a, b) => a + b, 0);
    const totalPaid = payments.filter((p) => p.jobId === activeJob).reduce((a, p) => a + p.amount, 0);
    const jobBudgets = budgets[activeJob] || {};
    const lines = [`JOB COST RECONCILIATION — ${job.name}${job.client ? ` (${job.client})` : ""}`, `Generated: ${new Date().toLocaleDateString()}`, ``];
    lines.push(["Cost Code","Actuals", budgetMode ? "Budget" : null, budgetMode ? "Over/Under" : null].filter(Boolean).join("\t"));
    Object.entries(byCode).forEach(([code, actual]) => {
      const budget = jobBudgets[code] || 0;
      const diff = budget ? actual - budget : null;
      lines.push([code, fmt(actual), budgetMode ? fmt(budget) : null, budgetMode && diff !== null ? (diff > 0 ? `Over ${fmt(diff)}` : `Under ${fmt(Math.abs(diff))}`) : null].filter(Boolean).join("\t"));
    });
    lines.push(`\nTOTAL COST\t${fmt(total)}`);
    lines.push(`PAYMENTS RECEIVED\t${fmt(totalPaid)}`);
    lines.push(`BALANCE DUE\t${fmt(total - totalPaid)}`);
    downloadTxt(`${job.name.replace(/\s+/g, "_")}_Reconciliation.tsv`, lines.join("\n"));
    showToast("Exported!");
  };

  const jobEntries = entries.filter((e) => e.jobId === activeJob);
  const activeJobObj = jobs.find((j) => j.id === activeJob);
  const byCode = {};
  jobEntries.forEach((e) => { byCode[e.code] = (byCode[e.code] || 0) + e.amount; });
  const total = Object.values(byCode).reduce((a, b) => a + b, 0);
  const totalPaid = payments.filter((p) => p.jobId === activeJob).reduce((a, p) => a + p.amount, 0);
  const balanceDue = total - totalPaid;
  const jobBudgets = budgets[activeJob] || {};

  return (
    <div className="fade-up">
      <ProjectSwitcher activeProject={activeProject} onProjectChange={onProjectChange} />

      <div className="fl-job-bar">
        <label className="field-label" style={{ margin: 0, whiteSpace: "nowrap" }}>Active Job</label>
        <select value={activeJob} onChange={(e) => setActiveJob(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
          <option value="">— Select a job —</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}{j.client ? ` · ${j.client}` : ""}</option>)}
        </select>
        <button className="btn" onClick={() => setShowNewJob((v) => !v)}>+ New Job</button>
      </div>

      {showNewJob && (
        <div className="fl-card fade-up" style={{ marginBottom: 20, border: "1.5px solid #f0a500" }}>
          <div className="section-label">Create Job</div>
          <div className="row-2 input-group">
            <div>
              <label className="field-label">Job Name *</label>
              <input type="text" placeholder={activeProject?.name || "Oak Valley Kitchen Remodel"} value={newJobName} onChange={(e) => setNewJobName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Client Name</label>
              <input type="text" placeholder={activeProject?.client_name || "Johnson Family"} value={newJobClient} onChange={(e) => setNewJobClient(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={!newJobName.trim()} onClick={addJob}>Create Job</button>
            <button className="btn btn-ghost" onClick={() => setShowNewJob(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!activeJob ? (
        <div style={{ background: "#ffffff", border: "1.5px solid #e0e4ef", padding: "40px 32px", textAlign: "center", color: "#909ab0", borderRadius: 8 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📒</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 6, color: "#1a1f2e" }}>No job selected</div>
          <div style={{ fontSize: 13 }}>Create a job above or select an existing one to start logging expenses.</div>
        </div>
      ) : (
        <>
          <div className="fl-tab-bar">
            {[["log","Log Expense"],["ledger","Ledger"],["recon","Reconciliation"]].map(([id, label]) => (
              <div key={id} className={`fl-tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>{label}</div>
            ))}
          </div>

          {tab === "log" && (
            <>
              <div className="fl-card" style={{ marginBottom: 16 }}>
                <div className="section-label">Voice Entry</div>
                <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
                  <textarea value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder='Speak or type: "Paid Home Depot $340 cash, framing lumber"' style={{ flex: 1, minHeight: 70 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button className={`voice-btn${isRecording ? " recording" : ""}`} onClick={toggleVoice}>{isRecording ? "⏹ Stop" : "🎤 Record"}</button>
                    <button className="btn btn-primary" style={{ padding: "9px 14px", fontSize: 12 }} disabled={!voiceText.trim()} onClick={parseVoice}>Parse →</button>
                  </div>
                </div>
                {voiceStatus && <div style={{ fontSize: 12, color: voiceStatus.startsWith("✓") ? "#27ae60" : "#909ab0", fontFamily: "'DM Mono',monospace" }}>{voiceStatus}</div>}
              </div>

              <div className="fl-card">
                <div className="section-label">Manual Entry</div>
                <div className="row-2 input-group">
                  <div><label className="field-label">Date</label><input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} /></div>
                  <div><label className="field-label">Payee / Vendor</label><input type="text" placeholder="Home Depot, J. Smith…" value={logPayee} onChange={(e) => setLogPayee(e.target.value)} /></div>
                </div>
                <div className="row-3 input-group">
                  <div style={{ position: "relative" }}>
                    <label className="field-label">Cost Code *</label>
                    <input type="text" placeholder="Type to search…" value={logCode} onChange={(e) => onCodeInput(e.target.value)} onKeyDown={onCodeKey} onBlur={() => setTimeout(() => setAcList([]), 150)} autoComplete="off" />
                    {acList.length > 0 && (
                      <div className="fl-ac-list">
                        {acList.map((c, i) => (
                          <div key={c} className={`fl-ac-item${i === acIdx ? " selected" : ""}`} onMouseDown={() => { setLogCode(c); setAcList([]); }}>{c}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="field-label">Payment Method</label>
                    <select value={logPay} onChange={(e) => setLogPay(e.target.value)}>
                      {PAYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className="field-label">Amount ($) *</label><input type="number" min="0" step="0.01" placeholder="0.00" value={logAmt} onChange={(e) => setLogAmt(e.target.value)} /></div>
                </div>
                <div className="input-group">
                  <label className="field-label">Description</label>
                  <input type="text" placeholder="What was this for?" value={logDesc} onChange={(e) => setLogDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logExpense()} />
                </div>
                <button className="btn btn-primary btn-lg" disabled={!logCode.trim() || !logAmt} onClick={logExpense}>+ Log Expense</button>
              </div>
            </>
          )}

          {tab === "ledger" && (
            <div className="fl-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 15, color: "#1a1f2e" }}>{activeJobObj?.name} — All Expenses</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#c47f00" }}>{fmt(jobEntries.reduce((a, e) => a + e.amount, 0))} total</div>
              </div>
              {jobEntries.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#909ab0", fontSize: 13 }}>No expenses logged yet.</div>
              ) : (
                <>
                  <div className="fl-entry-hdr">
                    {["Date","Cost Code","Payee / Desc","Pay Method","Amount",""].map((h, i) => <div key={i} className="fl-hdr-cell">{h}</div>)}
                  </div>
                  {[...jobEntries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                    <div key={e.id} className="fl-entry-row">
                      <div className="fl-mono" style={{ color: "#909ab0" }}>{e.date}</div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{e.code}</div>
                      <div style={{ fontSize: 12, color: "#1a1f2e" }}>{[e.payee, e.desc].filter(Boolean).join(" — ") || "—"}</div>
                      <div style={{ fontSize: 11, color: "#909ab0", fontFamily: "'DM Mono',monospace" }}>{e.pay}</div>
                      <div className="fl-mono" style={{ color: "#c47f00" }}>{fmt(e.amount)}</div>
                      <div style={{ cursor: "pointer", color: "#c0c8d8", fontSize: 13, textAlign: "center" }} onClick={() => deleteEntry(e.id)}>✕</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "recon" && (
            <>
              <div className="stat-row">
                <div className="stat-card"><div className="stat-label">Total Cost</div><div className="stat-value" style={{ fontSize: 20 }}>{fmt(total)}</div></div>
                <div className="stat-card"><div className="stat-label">Received</div><div className="stat-value" style={{ fontSize: 20 }}>{fmt(totalPaid)}</div></div>
                <div className="stat-card">
                  <div className="stat-label">Balance Due</div>
                  <div className="stat-value" style={{ fontSize: 20, color: balanceDue > 0 ? "#e74c3c" : "#27ae60" }}>{fmt(balanceDue)}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 18, alignItems: "center" }}>
                <button className="btn btn-primary" onClick={exportRecon}>⬇ Export (.TSV)</button>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#909ab0" }}>Budget mode</span>
                  <div onClick={() => setBudgetMode((v) => !v)} style={{ width: 36, height: 20, background: budgetMode ? "#f0a500" : "#e0e4ef", borderRadius: 10, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: 3, left: budgetMode ? 19 : 3, width: 14, height: 14, background: "#fff", borderRadius: "50%", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                  </div>
                </div>
              </div>

              <div className="fl-card">
                <div className={`fl-recon-hdr${budgetMode ? "" : " no-budget"}`}>
                  {["Cost Code","Actuals", budgetMode ? "Budget" : null, budgetMode ? "Over / Under" : null, ""].filter(Boolean).map((h, i) => (
                    <div key={i} className="fl-hdr-cell">{h}</div>
                  ))}
                </div>
                {Object.keys(byCode).length === 0 ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#909ab0", fontSize: 13 }}>No expenses logged for this job.</div>
                ) : (
                  Object.entries(byCode).map(([code, actual]) => {
                    const budget = jobBudgets[code] || 0;
                    const diff = budget ? actual - budget : null;
                    return (
                      <div key={code} className={`fl-recon-row${budgetMode ? "" : " no-budget"}`}>
                        <div style={{ fontWeight: 600, color: "#1a1f2e" }}>{code}</div>
                        <div className="fl-mono" style={{ color: "#c47f00" }}>{fmt(actual)}</div>
                        {budgetMode && (
                          <div>
                            <input type="number" min="0" step="0.01" value={budget || ""} placeholder="Set budget"
                              onChange={(e) => {
                                const b = { ...budgets, [activeJob]: { ...(budgets[activeJob] || {}), [code]: parseFloat(e.target.value) || 0 } };
                                persist(jobs, entries, payments, b);
                              }}
                              style={{ width: "100%", fontSize: 12, padding: "4px 8px" }}
                            />
                          </div>
                        )}
                        {budgetMode && (
                          <div>
                            {diff !== null && budget > 0
                              ? <span className={diff > 0 ? "fl-over" : "fl-under"}>{diff > 0 ? `▲ ${fmt(diff)}` : `▼ ${fmt(Math.abs(diff))}`}</span>
                              : <span style={{ color: "#c0c8d8", fontSize: 11 }}>—</span>
                            }
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "#c0c8d8" }}>—</div>
                      </div>
                    );
                  })
                )}
                <div className="fl-total-bar">
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", color: "#1a1f2e" }}>TOTAL JOB COST</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, color: "#c47f00" }}>{fmt(total)}</span>
                </div>
              </div>

              <div className="section-label" style={{ marginTop: 24 }}>Payments Received</div>
              <div className="fl-card">
                {payments.filter((p) => p.jobId === activeJob).map((p) => (
                  <div key={p.id} className="fl-pay-row">
                    <div style={{ fontSize: 13, color: "#1a1f2e" }}>{p.label}</div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#27ae60" }}>{fmt(p.amount)}</span>
                      <span style={{ cursor: "pointer", color: "#c0c8d8", fontSize: 13 }} onClick={() => persist(jobs, entries, payments.filter((x) => x.id !== p.id), budgets)}>✕</span>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid #f0f2f5" }}>
                  <input type="text" placeholder="Label (e.g. Construction Deposit)" value={payLabel} onChange={(e) => setPayLabel(e.target.value)} style={{ flex: 2 }} />
                  <input type="number" min="0" step="0.01" placeholder="Amount" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-primary" disabled={!payAmt} onClick={addPayment}>+ Add</button>
                </div>
                <div className="fl-total-bar" style={{ borderTopColor: balanceDue > 0 ? "#e74c3c" : "#27ae60" }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", color: "#1a1f2e" }}>BALANCE DUE</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 20, color: balanceDue > 0 ? "#e74c3c" : "#27ae60" }}>
                    {fmt(Math.abs(balanceDue))}{balanceDue <= 0 ? " ✓" : ""}
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}