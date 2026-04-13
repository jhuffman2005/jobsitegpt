import { useState } from "react";
import { callClaude, downloadTxt } from "../lib/api";
import { useFiles, useToast, useVoiceInput } from "../lib/hooks";
import { ProcessingSteps, UploadZone } from "../components/SharedComponents";

const STEPS = [
  "Processing description…",
  "Calculating cost breakdown…",
  "Writing contract language…",
  "Finalizing change order…",
];

const fmt = (p) =>
  `$${Number(p || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ChangeOrderGPT({ activeProject }) {
  const { files, b64, add, remove, reset: resetFiles } = useFiles();
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [coNumber, setCoNumber] = useState("001");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Pre-fill from active project
  const projName = activeProject?.name || projectName;
  const cliName = activeProject?.client_name || clientName;
  const cliEmail = activeProject?.client_email || clientEmail;

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
        text: `Project: "${projName}" | Client: "${cliName}" | CO #${coNumber}\nChange Description: ${description}\n\nGenerate a complete change order. Return ONLY valid JSON:\n{"changeOrderNumber":"string","projectName":"string","clientName":"string","date":"string","title":"string","description":"string","reason":"string","lineItems":[{"trade":"string","description":"string","quantity":1,"unit":"string","unitPrice":0,"totalPrice":0}],"subtotal":0,"overhead":0,"profit":0,"totalAmount":0,"daysAdded":0,"contractLanguage":"string","notes":"string"}`,
      });
      timers.forEach(clearTimeout);
      const r = await callClaude(
        [{ role: "user", content }],
        "You are an expert construction project manager writing professional change orders. Be specific with line items and pricing. Use current market rates. Return valid JSON only, no markdown."
      );
      setResult(r); setStatus("done"); setEmailSent(false);
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e.message);
      setStatus("error");
    }
  };

  const reset = () => {
    resetFiles(); setProjectName(""); setClientName(""); setClientEmail("");
    setDescription(""); setStatus("idle"); setResult(null); setError(""); setEmailSent(false);
  };

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
    r.lineItems.map((li) => `  ${li.trade} — ${li.description}: ${li.quantity} ${li.unit} @ ${fmt(li.unitPrice)} = ${fmt(li.totalPrice)}`).join("\n"),
    ``,
    `Subtotal: ${fmt(r.subtotal)}`,
    `Overhead: ${fmt(r.overhead)}`,
    `Profit: ${fmt(r.profit)}`,
    `TOTAL: ${fmt(r.totalAmount)}`,
    `Schedule Impact: +${r.daysAdded} days`,
    ``,
    `CONTRACT LANGUAGE`,
    r.contractLanguage,
  ].join("\n");

  const toEmailHtml = (r) => `
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
              <th style="padding: 10px 12px; text-align: left; color: #909ab0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;">Description</th>
              <th style="padding: 10px 12px; text-align: right; color: #909ab0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${r.lineItems.map((li, i) => `
              <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8f9fc'};">
                <td style="padding: 10px 12px; font-size: 13px; color: #1a1f2e; border-bottom: 1px solid #e0e4ef;">
                  ${li.description}
                  <div style="font-size: 11px; color: #909ab0; margin-top: 2px;">${li.trade} · ${li.quantity} ${li.unit} @ ${fmt(li.unitPrice)}</div>
                </td>
                <td style="padding: 10px 12px; font-size: 13px; color: #1a1f2e; text-align: right; border-bottom: 1px solid #e0e4ef;">${fmt(li.totalPrice)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div style="background: #1a1f2e; padding: 16px 20px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div style="color: #ffffff; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em;">Total Change Order Amount</div>
          <div style="color: #f0a500; font-size: 22px; font-family: monospace;">${fmt(r.totalAmount)}</div>
        </div>

        <div style="margin-top: 16px; padding: 14px; background: #fff8e6; border: 1px solid rgba(240,165,0,0.3); border-radius: 6px;">
          <div style="font-size: 11px; color: #c47f00; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Schedule Impact</div>
          <div style="font-size: 14px; color: #1a1f2e;">+${r.daysAdded} calendar days added to project schedule</div>
        </div>

        <div style="margin-top: 20px; padding: 14px; background: #f0f2f5; border-radius: 6px;">
          <div style="font-size: 11px; color: #909ab0; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Contract Language</div>
          <div style="font-size: 12px; color: #606880; font-style: italic; line-height: 1.7;">${r.contractLanguage}</div>
        </div>
      </div>
      <div style="background: #f0f2f5; padding: 16px 20px; border-radius: 0 0 8px 8px; text-align: center;">
        <div style="font-size: 12px; color: #909ab0;">Sent via JobSiteGPT · Construction AI Suite</div>
      </div>
    </div>
  `;

  const sendEmail = async () => {
    const emailTo = cliEmail || clientEmail;
    if (!emailTo) { showToast("No client email — add one to the project first."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: `Change Order #${result.changeOrderNumber} — ${result.title}`,
          html: toEmailHtml(result),
          from_name: "JobSiteGPT",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email failed");
      setEmailSent(true);
      showToast("Email sent to client!");
    } catch (e) {
      showToast(`Email failed: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fade-up">
      {/* Active project banner */}
      {activeProject && (
        <div style={{ background: "rgba(240,165,0,0.06)", border: "1px solid rgba(240,165,0,0.15)", padding: "12px 16px", marginBottom: 22, borderRadius: 6, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14 }}>📁</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>{activeProject.name}</div>
            <div style={{ fontSize: 12, color: "#909ab0" }}>{[activeProject.client_name, activeProject.client_email].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      )}

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

          <div className="section-label">What Changed</div>
          <div className="input-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label className="field-label" style={{ margin: 0 }}>Describe the Change *</label>
              <button className={`voice-btn${isRecording ? " recording" : ""}`} onClick={toggleVoice}>
                {isRecording ? "⏹ Stop Recording" : "🎤 Voice Input"}
              </button>
            </div>
            <textarea
              placeholder="e.g. Client requested to upgrade from LVP to hardwood flooring in all three bedrooms. Also adding under-cabinet lighting in kitchen — wasn't in original scope."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: 130 }}
            />
          </div>

          <div className="section-label">Supporting Photos / Docs</div>
          <div className="input-group">
            <UploadZone files={files} onAdd={add} onRemove={remove} hint="Photos of change conditions, spec sheets, written requests" />
          </div>

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
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#909ab0", marginBottom: 4 }}>
              CHANGE ORDER #{result.changeOrderNumber} · {result.date}
            </div>
            <div className="result-title">{result.title}</div>
            <div className="result-meta">
              {result.projectName} · {result.clientName} · +{result.daysAdded} days schedule impact
            </div>
            <div className="result-actions">
              <button className="btn btn-primary" onClick={() => downloadTxt(`CO_${result.changeOrderNumber}_${result.projectName.replace(/\s+/g, "_")}.txt`, toText(result))}>
                ⬇ Download CO
              </button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(toText(result)); showToast("Copied!"); }}>
                ⧉ Copy
              </button>
              <button
                className="btn"
                style={emailSent ? { borderColor: "#27ae60", color: "#27ae60" } : {}}
                disabled={sending}
                onClick={sendEmail}
              >
                {sending ? "Sending…" : emailSent ? "✓ Email Sent" : "✉ Email to Client"}
              </button>
              <button className="btn btn-ghost" onClick={reset}>↩ New CO</button>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Total Amount</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{`$${Number(result.totalAmount).toLocaleString()}`}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Line Items</div>
              <div className="stat-value">{result.lineItems.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Schedule Impact</div>
              <div className="stat-value">+{result.daysAdded}d</div>
            </div>
          </div>

          <div className="co-section">
            <div className="co-section-title">Description</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>{result.description}</div>
            <div className="co-section-title">Reason for Change</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#606880" }}>{result.reason}</div>
          </div>

          <div className="co-section">
            <div className="co-section-title">Cost Breakdown</div>
            {result.lineItems.map((li, i) => (
              <div key={i} className="co-line">
                <div>
                  <div className="co-line-desc">{li.description}</div>
                  <div style={{ fontSize: 11, color: "#909ab0", fontFamily: "'DM Mono',monospace" }}>
                    {li.trade} · {li.quantity} {li.unit} @ {fmt(li.unitPrice)}
                  </div>
                </div>
                <div className="co-line-price">{fmt(li.totalPrice)}</div>
              </div>
            ))}
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {[["Subtotal", result.subtotal], ["Overhead", result.overhead], ["Profit", result.profit]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#909ab0" }}>
                  <span>{l}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(v)}</span>
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
        </>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}