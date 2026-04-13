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

export default function ChangeOrderGPT() {
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
        text: `Project: "${projectName}" | Client: "${clientName}" | CO #${coNumber}\nChange Description: ${description}\n\nGenerate a complete change order. Return ONLY valid JSON:\n{"changeOrderNumber":"string","projectName":"string","clientName":"string","date":"string","title":"string","description":"string","reason":"string","lineItems":[{"trade":"string","description":"string","quantity":1,"unit":"string","unitPrice":0,"totalPrice":0}],"subtotal":0,"overhead":0,"profit":0,"totalAmount":0,"daysAdded":0,"contractLanguage":"string","notes":"string"}`,
      });
      timers.forEach(clearTimeout);
      const r = await callClaude(
        [{ role: "user", content }],
        "You are an expert construction project manager writing professional change orders. Be specific with line items and pricing. Use current market rates. Return valid JSON only, no markdown."
      );
      setResult(r); setStatus("done");
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e.message);
      setStatus("error");
    }
  };

  const reset = () => { resetFiles(); setProjectName(""); setClientName(""); setDescription(""); setStatus("idle"); setResult(null); setError(""); };

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

  return (
    <div className="fade-up">
      {(status === "idle" || status === "error") && (
        <>
          <div className="section-label">Project Info</div>
          <div className="row-3 input-group">
            <div>
              <label className="field-label">Project Name</label>
              <input type="text" placeholder="Oak Valley Renovation" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Client Name</label>
              <input type="text" placeholder="Johnson Family" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">CO Number</label>
              <input type="text" placeholder="001" value={coNumber} onChange={(e) => setCoNumber(e.target.value)} />
            </div>
          </div>

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
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6b7599", marginBottom: 4 }}>
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
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#6b7599" }}>{result.reason}</div>
          </div>

          <div className="co-section">
            <div className="co-section-title">Cost Breakdown</div>
            {result.lineItems.map((li, i) => (
              <div key={i} className="co-line">
                <div>
                  <div className="co-line-desc">{li.description}</div>
                  <div style={{ fontSize: 11, color: "#6b7599", fontFamily: "'IBM Plex Mono',monospace" }}>
                    {li.trade} · {li.quantity} {li.unit} @ {fmt(li.unitPrice)}
                  </div>
                </div>
                <div className="co-line-price">{fmt(li.totalPrice)}</div>
              </div>
            ))}
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {[["Subtotal", result.subtotal], ["Overhead", result.overhead], ["Profit", result.profit]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7599" }}>
                  <span>{l}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{fmt(v)}</span>
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
            <div style={{ fontSize: 13, lineHeight: 1.8, color: "#6b7599", fontStyle: "italic" }}>{result.contractLanguage}</div>
          </div>

          {result.notes && (
            <div className="co-section">
              <div className="co-section-title">Notes</div>
              <div style={{ fontSize: 13, color: "#6b7599" }}>{result.notes}</div>
            </div>
          )}
        </>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
