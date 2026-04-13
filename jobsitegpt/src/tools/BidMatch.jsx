import { useState } from "react";
import { callClaude } from "../lib/api";
import { toBase64 } from "../lib/api";
import { useToast } from "../lib/hooks";
import { ProcessingSteps, UploadZone } from "../components/SharedComponents";

const STEPS = [
  "Uploading bid documents…",
  "Extracting line items & pricing…",
  "Running apples-to-apples analysis…",
  "Generating comparison matrix…",
];

const fmt = (p) => p ? `$${Number(p).toLocaleString()}` : "N/A";

export default function BidMatch({ activeProject }) {
  const [bids, setBids] = useState([
    { name: "", files: [], b64: {} },
    { name: "", files: [], b64: {} },
  ]);
  const [projectDesc, setProjectDesc] = useState("");
  const [status, setStatus] = useState("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();

  const addBid = () => {
    if (bids.length < 5) setBids((p) => [...p, { name: "", files: [], b64: {} }]);
  };
  const removeBid = (i) => {
    if (bids.length > 2) setBids((p) => p.filter((_, idx) => idx !== i));
  };
  const updateName = (i, v) => setBids((p) => p.map((b, idx) => idx === i ? { ...b, name: v } : b));

  const addFiles = async (i, newFiles) => {
    const valid = Array.from(newFiles).filter(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/") || f.type.includes("word") || f.name.endsWith(".docx")
    );
    const map = {};
    for (const f of valid) map[f.name] = await toBase64(f);
    setBids((p) => p.map((b, idx) =>
      idx === i
        ? { ...b, files: [...b.files, ...valid.filter((f) => !b.files.find((e) => e.name === f.name))], b64: { ...b.b64, ...map } }
        : b
    ));
  };

  const removeFile = (bidIdx, name) =>
    setBids((p) => p.map((b, i) =>
      i === bidIdx
        ? { ...b, files: b.files.filter((f) => f.name !== name), b64: Object.fromEntries(Object.entries(b.b64).filter(([k]) => k !== name)) }
        : b
    ));

  const generate = async () => {
    setStatus("loading"); setStepIdx(0); setError("");
    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 2000));
    try {
      const content = [];

      if (activeProject) {
        content.push({ type: "text", text: `Project Context: "${activeProject.name}" | Client: "${activeProject.client_name || "N/A"}" | Address: "${activeProject.address || "N/A"}" | Contract: ${activeProject.contract_type?.replace("_", " ")}` });
      }

      bids.forEach((bid, bi) => {
        content.push({ type: "text", text: `\n--- BID ${bi + 1}: ${bid.name || `Contractor ${bi + 1}`} ---` });
        bid.files.forEach((f) => {
          const data = bid.b64[f.name];
          if (!data) return;
          if (f.type.startsWith("image/"))
            content.push({ type: "image", source: { type: "base64", media_type: f.type, data } });
          else
            content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
        });
      });
      content.push({
        type: "text",
        text: `Project: ${projectDesc || activeProject?.name || "As described in bid documents"}\n\nAnalyze all bids and return ONLY valid JSON:\n{"projectSummary":"string","recommendedBidIndex":0,"analysis":{"totalBids":0,"pricingRange":{"low":0,"high":0},"averagePrice":0},"bids":[{"bidIndex":0,"contractorName":"string","totalPrice":0,"normalizedPrice":0,"grade":"A","summary":"string","scopeFlags":["string"],"inclusions":["string"],"exclusions":["string"],"redFlags":["string"],"strengths":["string"]}],"scopeGaps":["string"],"recommendation":"string"}`,
      });
      timers.forEach(clearTimeout);
      const r = await callClaude(
        [{ role: "user", content }],
        "You are an expert construction cost estimator and procurement specialist. Analyze bids objectively. Grade A=excellent B=good C=average D=below average F=poor. Return valid JSON only, no markdown.",
        5000
      );
      setResult(r); setStatus("done");
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e.message);
      setStatus("error");
    }
  };

  const reset = () => {
    setBids([{ name: "", files: [], b64: {} }, { name: "", files: [], b64: {} }]);
    setProjectDesc(""); setStatus("idle"); setResult(null); setError("");
  };

  const canGenerate = bids.filter((b) => b.files.length > 0 || b.name.trim()).length >= 2;

  return (
    <div className="fade-up">
      {/* Active project banner */}
      {activeProject && (
        <div style={{ background: "rgba(240,165,0,0.06)", border: "1px solid rgba(240,165,0,0.15)", padding: "12px 16px", marginBottom: 22, borderRadius: 6, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14 }}>📁</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>{activeProject.name}</div>
            <div style={{ fontSize: 12, color: "#909ab0" }}>{[activeProject.client_name, activeProject.address].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      )}

      {(status === "idle" || status === "error") && (
        <>
          <div className="section-label">Project Description</div>
          <div className="input-group">
            <label className="field-label">What are these bids for?</label>
            <textarea
              placeholder="e.g. Full kitchen and primary bath remodel — approx 400 SF. Scope includes demo, framing, electrical, plumbing, tile, cabinets, and finishes."
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              style={{ minHeight: 80 }}
            />
          </div>

          <div className="section-label">Contractor Bids</div>
          {bids.map((bid, i) => (
            <div key={i} style={{ background: "#ffffff", border: "1.5px solid #e0e4ef", padding: "18px 20px", marginBottom: 14, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, color: "#c47f00", background: "rgba(240,165,0,0.1)", padding: "3px 10px", border: "1px solid rgba(240,165,0,0.2)", borderRadius: 4, whiteSpace: "nowrap" }}>
                  BID {i + 1}
                </div>
                <input type="text" placeholder={`Contractor ${i + 1} name`} value={bid.name} onChange={(e) => updateName(i, e.target.value)} style={{ flex: 1 }} />
                {bids.length > 2 && (
                  <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => removeBid(i)}>✕</button>
                )}
              </div>
              <UploadZone
                files={bid.files}
                onAdd={(f) => addFiles(i, f)}
                onRemove={(n) => removeFile(i, n)}
                hint="PDF or Word bid document"
              />
            </div>
          ))}

          {bids.length < 5 && (
            <button className="btn" style={{ marginBottom: 22 }} onClick={addBid}>+ Add Another Bid</button>
          )}

          {error && <div className="error-box">⚠ {error}</div>}
          <button className="btn btn-primary btn-lg" disabled={!canGenerate} onClick={generate}>
            ⚖ Analyze Bids
          </button>
        </>
      )}

      {status === "loading" && <ProcessingSteps steps={STEPS} idx={stepIdx} />}

      {status === "done" && result && (
        <>
          <div className="result-header-card">
            <div className="result-title">Bid Analysis Complete</div>
            <div className="result-meta">
              {result.analysis.totalBids} bids · Range: {fmt(result.analysis.pricingRange.low)} – {fmt(result.analysis.pricingRange.high)} · Avg: {fmt(result.analysis.averagePrice)}
            </div>
            <div className="result-actions">
              <button className="btn" onClick={() => { navigator.clipboard.writeText(result.recommendation); showToast("Recommendation copied!"); }}>⧉ Copy Recommendation</button>
              <button className="btn btn-ghost" onClick={reset}>↩ New Analysis</button>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-card"><div className="stat-label">Bids Analyzed</div><div className="stat-value">{result.analysis.totalBids}</div></div>
            <div className="stat-card">
              <div className="stat-label">Price Range</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{fmt(result.analysis.pricingRange.low)}–{fmt(result.analysis.pricingRange.high)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Recommended</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{result.bids[result.recommendedBidIndex]?.contractorName || "—"}</div>
            </div>
          </div>

          <div style={{ background: "#ffffff", border: "1.5px solid #f0a500", borderTop: "3px solid #f0a500", padding: "16px 20px", marginBottom: 22, borderRadius: 8 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#909ab0", marginBottom: 8 }}>AI Recommendation</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "#1a1f2e" }}>{result.recommendation}</div>
          </div>

          <div className="section-label">Bid Comparison</div>
          {result.bids.map((bid, i) => (
            <div key={i} className={`bid-card${i === result.recommendedBidIndex ? " recommended" : ""}`}>
              <div className={`grade-badge grade-${bid.grade}`}>{bid.grade}</div>
              <div className="bid-card-body" style={{ flex: 1 }}>
                {i === result.recommendedBidIndex && <div className="recommended-pill">★ RECOMMENDED</div>}
                <div className="bid-name">{bid.contractorName}</div>
                <div className="bid-price">{fmt(bid.totalPrice)} total · {fmt(bid.normalizedPrice)} normalized</div>
                <div style={{ fontSize: 13, color: "#606880", lineHeight: 1.6, marginBottom: 10 }}>{bid.summary}</div>
                <div className="bid-flags">
                  {bid.redFlags?.map((f, j) => <span key={j} className="bid-flag flag-gap">⚠ {f}</span>)}
                  {bid.strengths?.map((f, j) => <span key={j} className="bid-flag flag-ok">✓ {f}</span>)}
                  {bid.exclusions?.map((f, j) => <span key={j} className="bid-flag flag-note">— {f}</span>)}
                </div>
              </div>
            </div>
          ))}

          {result.scopeGaps?.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 22 }}>Scope Gaps Across All Bids</div>
              <div className="notes-block">
                <div className="notes-list">{result.scopeGaps.map((g, i) => <div key={i} className="notes-item">{g}</div>)}</div>
              </div>
            </>
          )}
        </>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}