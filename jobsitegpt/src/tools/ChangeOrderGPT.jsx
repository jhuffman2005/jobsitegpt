import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { callClaude, downloadTxt } from "../lib/api";
import { useFiles, useToast, useVoiceInput } from "../lib/hooks";
import { storeApproval, saveGeneration, getUserSettings, getGenerationById } from "../lib/projects";
import { ProcessingSteps, UploadZone, SpecialInstructions } from "../components/SharedComponents";
import ProjectSwitcher from "../components/ProjectSwitcher";

const STEPS = [
  "Processing description…",
  "Calculating cost breakdown…",
  "Writing contract language…",
  "Finalizing change order…",
];

const fmt = (p) =>
  `$${Number(p || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ChangeOrderGPT({ activeProject, onProjectChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const historyId = searchParams.get("historyId");
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [coNumber, setCoNumber] = useState("001");
  const [description, setDescription] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [contractorEmail, setContractorEmail] = useState("");

  const projName = activeProject?.name || projectName;
  const cliName = activeProject?.client_name || clientName;
  const cliEmail = activeProject?.client_email || clientEmail;
  const markup = activeProject?.markup_percent || 0;

  // Load contractor email from settings
  useEffect(() => {
    getUserSettings().then((s) => {
      if (s.contractor_email) setContractorEmail(s.contractor_email);
    }).catch(() => {});
  }, []);

  // Hydrate from a saved generation when navigated here with ?historyId=
  useEffect(() => {
    if (!historyId) return;
    let cancelled = false;
    (async () => {
      const g = await getGenerationById(historyId);
      if (cancelled) return;
      if (g?.result_data) {
        setResult(g.result_data);
        setStatus("done");
        setError("");
        setEmailSent(false);
      }
    })();
    return () => { cancelled = true; };
  }, [historyId]);

  const { isRecording, toggle: toggleVoice } = useVoiceInput((transcript) => {
    setDescription((prev) => (prev ? prev + " " + transcript : transcript));
  });

  const generate = async () => {
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 1700));
    try {
      const content = [];
      files.forEach((f) => {
        const data = b64[f.name];
        if (!data) return;
        if (f.type.startsWith("image/"))
          content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
        else
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      });
      content.push({
        type: "text",
        text: `Project: "${projName}" | Client: "${cliName}" | CO #${coNumber}\nMarkup/Profit: ${markup}%\nChange Description: ${description}\n${specialInstructions ? `Special Instructions: ${specialInstructions}\n` : ""}\nGenerate a complete change order. Use ${markup}% for overhead+profit combined. Return ONLY valid JSON:\n{"changeOrderNumber":"string","projectName":"string","clientName":"string","date":"string","title":"string","description":"string","reason":"string","lineItems":[{"trade":"string","description":"string","quantity":1,"unit":"string","unitPrice":0,"totalPrice":0}],"subtotal":0,"overhead":0,"profit":0,"totalAmount":0,"daysAdded":0,"contractLanguage":"string","notes":"string"}`,
      });
      timers.forEach(clearTimeout);
      const r = await callClaude(
        [{ role: "user", content }],
        "You are an expert construction project manager writing professional change orders. Be specific with line items and pricing. Use current market rates. Return valid JSON only, no markdown."
      );
      setResult(r); setStatus("done"); setEmailSent(false);

      // localStorage history
      const history = JSON.parse(localStorage.getItem("jsg_history") || "[]");
      history.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        projectId: activeProject?.id || null,
        tool: "ChangeOrderGPT",
        title: r.title,
        date: new Date().toISOString(),
        summary: `CO #${r.changeOrderNumber} · $${Number(r.totalAmount).toLocaleString()} · +${r.daysAdded} days`,
      });
      localStorage.setItem("jsg_history", JSON.stringify(history.slice(0, 100)));

      // Supabase history
      if (activeProject?.id) {
        saveGeneration(
          activeProject.id, "ChangeOrderGPT", r.title,
          `CO #${r.changeOrderNumber} · ${fmt(r.totalAmount)} · +${r.daysAdded} days`,
          r
        );
      }
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e.message);
      setStatus("error");
    }
  };

  const reset = () => {
    resetFiles(); setProjectName(""); setClientName(""); setClientEmail("");
    setDescription(""); setSpecialInstructions("");
    setStatus("idle"); setResult(null); setError(""); setEmailSent(false);
    if (historyId) {
      const p = new URLSearchParams(searchParams);
      p.delete("historyId");
      setSearchParams(p, { replace: true });
    }
  };

  const recalcTotals = (lineItems) => {
    const subtotal = lineItems.reduce((sum, li) => sum + (parseFloat(li.totalPrice) || 0), 0);
    const overheadRate = markup > 0 ? markup / 2 / 100 : (result.overhead / result.subtotal) || 0.1;
    const profitRate = markup > 0 ? markup / 2 / 100 : (result.profit / result.subtotal) || 0.1;
    const overhead = subtotal * overheadRate;
    const profit = subtotal * profitRate;
    return { subtotal, overhead, profit, totalAmount: subtotal + overhead + profit };
  };

  const updateLineItem = (idx, field, value) => {
    const updated = result.lineItems.map((li, i) => {
      if (i !== idx) return li;
      const newLi = { ...li, [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        newLi.totalPrice = (parseFloat(newLi.quantity) || 0) * (parseFloat(newLi.unitPrice) || 0);
      }
      if (field === "totalPrice") newLi.totalPrice = parseFloat(value) || 0;
      return newLi;
    });
    setResult({ ...result, lineItems: updated, ...recalcTotals(updated) });
  };

  const addLineItem = () => {
    const updated = [...result.lineItems, { trade: "", description: "New line item", quantity: 1, unit: "LS", unitPrice: 0, totalPrice: 0 }];
    setResult({ ...result, lineItems: updated, ...recalcTotals(updated) });
  };

  const removeLineItem = (idx) => {
    const updated = result.lineItems.filter((_, i) => i !== idx);
    setResult({ ...result, lineItems: updated, ...recalcTotals(updated) });
  };

  const toText = (r) => [
    `CHANGE ORDER #${r.changeOrderNumber}`, `================`,
    `Project: ${r.projectName}`, `Client: ${r.clientName}`,
    `Date: ${r.date}`, `Title: ${r.title}`, ``,
    `DESCRIPTION`, r.description, ``,
    `REASON FOR CHANGE`, r.reason, ``,
    `COST BREAKDOWN`,
    r.lineItems.map((li) => `  ${li.trade} — ${li.description}: ${li.quantity} ${li.unit} @ ${fmt(li.unitPrice)} = ${fmt(li.totalPrice)}`).join("\n"),
    ``, `Subtotal: ${fmt(r.subtotal)}`, `Overhead: ${fmt(r.overhead)}`,
    `Profit: ${fmt(r.profit)}`, `TOTAL: ${fmt(r.totalAmount)}`,
    `Schedule Impact: +${r.daysAdded} days`, ``, `CONTRACT LANGUAGE`, r.contractLanguage,
  ].join("\n");

  const toEmailHtml = (r, approvalToken) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1f2e; padding: 20px; border-radius: 8px 8px 0 0;">
        <div style="color: #f0a500; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px;">Change Order #${r.changeOrderNumber}</div>
        <div style="color: #ffffff; font-size: 24px; font-weight: bold;">${r.title}</div>
        <div style="color: #909ab0; font-size: 13px; margin-top: 4px;">${r.projectName} · ${r.clientName} · ${r.date}</div>
      </div>
      <div style="background: #f8f9fc; padding: 20px; border: 1px solid #e0e4ef;">
        <p style="color: #1a1f2e; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">${r.description}</p>
        <p style="color: #606880; font-size: 13px; line-height: 1.6; margin-bottom: 20px;"><strong>Reason:</strong> ${r.reason}</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #1a1f2e;">
              <th style="padding: 10px 12px; text-align: left; color: #909ab0; font-size: 11px; text-transform: uppercase;">Description</th>
              <th style="padding: 10px 12px; text-align: right; color: #909ab0; font-size: 11px; text-transform: uppercase;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${r.lineItems.map((li, i) => `
              <tr style="background: ${i % 2 === 0 ? "#ffffff" : "#f8f9fc"};">
                <td style="padding: 10px 12px; font-size: 13px; color: #1a1f2e; border-bottom: 1px solid #e0e4ef;">
                  ${li.description}
                  <div style="font-size: 11px; color: #909ab0; margin-top: 2px;">${li.trade} · ${li.quantity} ${li.unit} @ ${fmt(li.unitPrice)}</div>
                </td>
                <td style="padding: 10px 12px; font-size: 13px; color: #1a1f2e; text-align: right; border-bottom: 1px solid #e0e4ef;">${fmt(li.totalPrice)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div style="background: #1a1f2e; padding: 16px 20px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="color: #ffffff; font-size: 16px; font-weight: bold;">Total Change Order Amount</div>
          <div style="color: #f0a500; font-size: 22px; font-family: monospace;">${fmt(r.totalAmount)}</div>
        </div>
        <div style="margin-bottom: 16px; padding: 14px; background: #fff8e6; border: 1px solid rgba(240,165,0,0.3); border-radius: 6px;">
          <div style="font-size: 13px; color: #1a1f2e;">Schedule Impact: <strong>+${r.daysAdded} calendar days</strong></div>
        </div>
        ${approvalToken ? `
        <div style="text-align: center; margin-top: 24px; padding: 20px; background: #ffffff; border: 2px solid #f0a500; border-radius: 8px;">
          <div style="font-size: 15px; color: #1a1f2e; margin-bottom: 16px; font-weight: bold;">Please review and approve this change order</div>
          <a href="${window.location.origin}/approve/${approvalToken}" style="background: #f0a500; color: #000; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 15px; border-radius: 6px; display: inline-block;">
            ✓ Approve Change Order
          </a>
          <div style="font-size: 11px; color: #909ab0; margin-top: 12px;">By clicking approve, you authorize this change order and agree to the additional cost.</div>
        </div>
        ` : ""}
      </div>
      <div style="background: #f0f2f5; padding: 16px 20px; border-radius: 0 0 8px 8px; text-align: center;">
        <div style="font-size: 12px; color: #909ab0;">Sent via JobSiteGPT · Construction AI Suite</div>
      </div>
    </div>
  `;

  const sendEmail = async (withApproval = false) => {
    const emailTo = cliEmail;
    if (!emailTo) { showToast("No client email — add one to the project first."); return; }
    setSending(true);
    try {
      const approvalToken = withApproval ? `${result.changeOrderNumber}-${Date.now()}` : null;

      // If sending for approval, store in Supabase so the approve page can retrieve it
      if (withApproval && approvalToken) {
        try {
          await storeApproval(
            approvalToken,
            activeProject?.id || null,
            result,
            contractorEmail || null
          );
        } catch (e) {
          console.warn("Could not store approval in Supabase:", e.message);
          // Continue anyway — approval link still works if table isn't migrated yet
        }
      }

      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: `Change Order #${result.changeOrderNumber} — ${result.title}${withApproval ? " (Approval Required)" : ""}`,
          html: toEmailHtml(result, approvalToken),
          from_name: "JobSiteGPT",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email failed");
      setEmailSent(true);
      showToast(withApproval ? "Approval request sent to client!" : "Email sent to client!");
    } catch (e) {
      showToast(`Email failed: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fade-up">
      <ProjectSwitcher activeProject={activeProject} onProjectChange={onProjectChange} />

      {(status === "idle" || status === "error") && (
        <>
          <div className="section-label">Project Info</div>
          <div className="row-3 input-group">
            <div>
              <label className="field-label">Project Name</label>
              <input type="text" placeholder="Oak Valley Renovation" value={activeProject?.name || projectName} onChange={(e) => setProjectName(e.target.value)} disabled={!!activeProject?.name} />
            </div>
            <div>
              <label className="field-label">Client Name</label>
              <input type="text" placeholder="Johnson Family" value={activeProject?.client_name || clientName} onChange={(e) => setClientName(e.target.value)} disabled={!!activeProject?.client_name} />
            </div>
            <div>
              <label className="field-label">CO Number</label>
              <input type="text" placeholder="001" value={coNumber} onChange={(e) => setCoNumber(e.target.value)} />
            </div>
          </div>

          {!activeProject?.client_email && (
            <div className="input-group">
              <label className="field-label">Client Email (for sending)</label>
              <input type="email" placeholder="client@email.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
          )}

          {markup > 0 && (
            <div style={{ background: "rgba(240,165,0,0.06)", border: "1px solid rgba(240,165,0,0.15)", padding: "10px 14px", marginBottom: 22, borderRadius: 6, fontSize: 12, color: "#909ab0", fontFamily: "'Inter',sans-serif" }}>
              Using {markup}% markup from project settings for overhead + profit
            </div>
          )}

          <div className="section-label">What Changed</div>
          <div className="input-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label className="field-label" style={{ margin: 0 }}>Describe the Change *</label>
              <button className={`voice-btn${isRecording ? " recording" : ""}`} onClick={toggleVoice}>
                {isRecording ? "⏹ Stop Recording" : "🎤 Voice Input"}
              </button>
            </div>
            <textarea
              placeholder="e.g. Client requested to upgrade from LVP to hardwood flooring in all three bedrooms."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: 130 }}
            />
          </div>

          <div className="section-label">Supporting Photos / Docs</div>
          <div className="input-group">
            <UploadZone files={files} onAdd={add} onRemove={remove} hint="Photos of change conditions, spec sheets, written requests" />
          </div>

          <SpecialInstructions value={specialInstructions} onChange={setSpecialInstructions} />

          {error && <div className="error-box">⚠ {error}</div>}
          <button className="btn btn-primary btn-lg" disabled={!description.trim()} onClick={generate}>
            📋 Generate Change Order
          </button>
        </>
      )}

      {status === "loading" && <ProcessingSteps steps={STEPS} idx={stepIdx} />}

      {status === "done" && result && (
        <>
          <div className="result-header-card">
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: "#909ab0", marginBottom: 4 }}>
              CHANGE ORDER #{result.changeOrderNumber} · {result.date}
            </div>
            <div className="result-title">{result.title}</div>
            <div className="result-meta">
              {result.projectName} · {result.clientName} · +{result.daysAdded} days schedule impact
            </div>
            <div className="result-actions">
              <button className="btn btn-primary" onClick={() => downloadTxt(`CO_${result.changeOrderNumber}.txt`, toText(result))}>⬇ Download</button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(toText(result)); showToast("Copied!"); }}>⧉ Copy</button>
              <button className="btn" disabled={sending} onClick={() => sendEmail(false)}>
                {sending ? "Sending…" : emailSent ? "✓ Sent" : "✉ Email Client"}
              </button>
              <button className="btn" style={{ borderColor: "rgba(240,165,0,0.4)", color: "#c47f00" }} disabled={sending} onClick={() => sendEmail(true)}>
                ✍ Send for Approval
              </button>
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
            <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 16, color: "#1a1f2e" }}>{result.description}</div>
            <div className="co-section-title">Reason for Change</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#606880" }}>{result.reason}</div>
          </div>

          <div className="co-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div className="co-section-title" style={{ margin: 0 }}>Cost Breakdown</div>
              <button className="btn" style={{ padding: "5px 12px", fontSize: 11 }} onClick={addLineItem}>+ Add Line</button>
            </div>

            {result.lineItems.map((li, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #f0f2f5" }}>
                {editingLine === i ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="row-2">
                      <div><label className="field-label">Trade</label><input type="text" value={li.trade} onChange={e => updateLineItem(i, "trade", e.target.value)} style={{ fontSize: 13 }} /></div>
                      <div><label className="field-label">Description</label><input type="text" value={li.description} onChange={e => updateLineItem(i, "description", e.target.value)} style={{ fontSize: 13 }} /></div>
                    </div>
                    <div className="row-3">
                      <div><label className="field-label">Qty</label><input type="number" value={li.quantity} onChange={e => updateLineItem(i, "quantity", e.target.value)} style={{ fontSize: 13 }} /></div>
                      <div><label className="field-label">Unit</label><input type="text" value={li.unit} onChange={e => updateLineItem(i, "unit", e.target.value)} style={{ fontSize: 13 }} /></div>
                      <div><label className="field-label">Unit Price</label><input type="number" value={li.unitPrice} onChange={e => updateLineItem(i, "unitPrice", e.target.value)} style={{ fontSize: 13 }} /></div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 11 }} onClick={() => setEditingLine(null)}>✓ Done</button>
                      <button className="btn" style={{ padding: "6px 14px", fontSize: 11, color: "#e74c3c", borderColor: "rgba(231,76,60,0.3)" }} onClick={() => removeLineItem(i)}>Remove</button>
                    </div>
                  </div>
                ) : (
                  <div className="co-line" style={{ padding: 0, borderBottom: "none" }}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setEditingLine(i)}>
                      <div className="co-line-desc">{li.description}</div>
                      <div style={{ fontSize: 11, color: "#909ab0", fontFamily: "'Inter',sans-serif" }}>
                        {li.trade} · {li.quantity} {li.unit} @ {fmt(li.unitPrice)}
                        <span style={{ marginLeft: 8, color: "#c0c8d8" }}>✏ click to edit</span>
                      </div>
                    </div>
                    <div className="co-line-price">{fmt(li.totalPrice)}</div>
                  </div>
                )}
              </div>
            ))}

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {[["Subtotal", result.subtotal], ["Overhead", result.overhead], ["Profit", result.profit]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#909ab0" }}>
                  <span>{l}</span>
                  <span style={{ fontFamily: "'Inter',sans-serif" }}>{fmt(v)}</span>
                </div>
              ))}
            </div>
            <div className="co-total">
              <span className="co-total-label">TOTAL CHANGE ORDER AMOUNT</span>
              <span className="co-total-price">{fmt(result.totalAmount)}</span>
            </div>
          </div>

          <div className="co-section">
            <div className="co-section-title">Contract Language</div>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: "#606880", fontStyle: "italic" }}>{result.contractLanguage}</div>
          </div>

          {result.notes && (
            <div className="co-section">
              <div className="co-section-title">Notes</div>
              <div style={{ fontSize: 13, color: "#606880" }}>{result.notes}</div>
            </div>
          )}

          <div style={{ background: "rgba(240,165,0,0.06)", border: "1px solid rgba(240,165,0,0.2)", padding: "16px 20px", borderRadius: 8, marginTop: 8 }}>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 6 }}>Client Approval</div>
            <div style={{ fontSize: 12, color: "#606880", marginBottom: 14 }}>
              Send for approval to get a digital sign-off from your client. They'll receive an email with an approve button.
              {contractorEmail && <span> A signed copy will be sent to <strong>{contractorEmail}</strong>.</span>}
              {!contractorEmail && <span> Add your contractor email in <a href="/settings" style={{ color: "#f0a500" }}>Settings</a> to receive signed copies.</span>}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" disabled={sending || !cliEmail} onClick={() => sendEmail(true)}>
                ✍ Send for Client Approval
              </button>
              <button className="btn" disabled={sending || !cliEmail} onClick={() => sendEmail(false)}>
                ✉ Send Copy Only
              </button>
              {!cliEmail && <span style={{ fontSize: 12, color: "#e74c3c", alignSelf: "center" }}>Add client email to project first</span>}
            </div>
          </div>
        </>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
