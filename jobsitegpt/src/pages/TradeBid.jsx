import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getBidInvitation } from "../lib/projects";

const fmt = (p) =>
  `$${Number(p || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TradeBid() {
  const { token } = useParams();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Bid form
  const [contractorName, setContractorName] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [lineItemPrices, setLineItemPrices] = useState({}); // { idx: price }
  const [inclusions, setInclusions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getBidInvitation(token);
        setInvitation(data);
        if (data.status === "submitted") setSubmitted(true);
        if (data.trade_contact_name) setContractorName(data.trade_contact_name);
      } catch {
        setFetchError("This bid request link is invalid or has expired.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const trade = invitation.scope_snapshot?.trades?.[0];
      const lineItems = trade?.lineItems?.map((li, i) => ({
        description: li.description,
        note: li.note || null,
        price: lineItemPrices[i] != null && lineItemPrices[i] !== "" ? Number(lineItemPrices[i]) : null,
      })) || [];

      const res = await fetch("/api/bid-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          contractor_name: contractorName.trim() || null,
          total_price: totalPrice === "" ? null : Number(totalPrice),
          line_items: lineItems,
          inclusions: inclusions.trim() || null,
          exclusions: exclusions.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={centeredPage}>
        <div style={{ color: "#909ab0", fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Loading…</div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={centeredPage}>
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠</div>
          <div style={{ fontSize: 18, color: "#1a1f2e", fontWeight: 700, marginBottom: 8, fontFamily: "Arial, sans-serif" }}>Link Not Found</div>
          <div style={{ fontSize: 13, color: "#909ab0" }}>{fetchError}</div>
        </div>
      </div>
    );
  }

  const expired = invitation.expires_at && new Date(invitation.expires_at) < new Date();
  if (expired && !submitted) {
    return (
      <div style={centeredPage}>
        <div style={{ maxWidth: 480, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 12, color: "#909ab0" }}>⏱</div>
          <div style={{ fontSize: 20, color: "#1a1f2e", fontWeight: 700, marginBottom: 8, fontFamily: "Arial, sans-serif" }}>Bid Window Closed</div>
          <div style={{ fontSize: 13, color: "#606880" }}>
            This bid request expired on {new Date(invitation.expires_at).toLocaleDateString()}. Please contact the GC to request a new link.
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ ...centeredPage, background: "#f8f9fc" }}>
        <div style={{ maxWidth: 480, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 16, color: "#27ae60" }}>✓</div>
          <div style={{ fontWeight: 800, fontSize: 26, color: "#27ae60", marginBottom: 8, fontFamily: "Arial, sans-serif" }}>Bid Submitted</div>
          <div style={{ fontSize: 14, color: "#606880", marginBottom: 28 }}>
            Thanks — your bid for {invitation.trade_name} on {invitation.scope_snapshot?.projectName} has been received. The GC will follow up.
          </div>
        </div>
      </div>
    );
  }

  const scope = invitation.scope_snapshot;
  const trade = scope?.trades?.[0];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: "Arial, sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: "#1a1f2e", padding: "20px 24px", borderRadius: "8px 8px 0 0" }}>
          <div style={{ color: "#f0a500", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            Bid Request · {invitation.trade_name}
          </div>
          <div style={{ color: "#fff", fontSize: 24, fontWeight: "bold" }}>{scope?.projectName}</div>
          <div style={{ color: "#909ab0", fontSize: 13, marginTop: 4 }}>
            {scope?.projectType}
            {scope?.projectAddress ? ` · ${scope.projectAddress}` : ""}
            {scope?.estimatedDuration ? ` · ${scope.estimatedDuration}` : ""}
          </div>
        </div>

        {/* Body */}
        <div style={{ background: "#fff", padding: "28px", border: "1px solid #e0e4ef", borderTop: "none" }}>
          {scope?.overview && (
            <>
              <SectionLabel>Project Overview</SectionLabel>
              <p style={{ fontSize: 14, color: "#1a1f2e", lineHeight: 1.7, margin: "0 0 22px" }}>{scope.overview}</p>
            </>
          )}

          {trade && (
            <>
              <SectionLabel>Your Scope — {trade.tradeName}</SectionLabel>
              <div style={{ background: "#f8f9fc", border: "1px solid #e0e4ef", borderRadius: 6, padding: "14px 18px", marginBottom: 22 }}>
                <p style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 10px", color: "#1a1f2e" }}>{trade.scopeText}</p>
                {trade.lineItems?.length > 0 && (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "#1a1f2e" }}>
                    {trade.lineItems.map((li, i) => (
                      <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                        {li.description}
                        {li.note && <span style={{ color: "#909ab0", fontStyle: "italic" }}> — {li.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {scope?.generalConditions?.length > 0 && (
            <BulletSection title="General Conditions" items={scope.generalConditions} />
          )}
          {scope?.exclusions?.length > 0 && (
            <BulletSection title="Project-Wide Exclusions" items={scope.exclusions} />
          )}
          {scope?.clarifications?.length > 0 && (
            <BulletSection title="Clarifications" items={scope.clarifications} />
          )}

          {/* Bid form */}
          <div style={{ height: 1, background: "#e0e4ef", margin: "28px 0" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1f2e", marginBottom: 6 }}>Submit Your Bid</div>
          <div style={{ fontSize: 12, color: "#909ab0", marginBottom: 18 }}>
            Pricing per line item is optional — at minimum provide your total bid amount.
          </div>

          <FieldLabel>Your Company / Contractor Name</FieldLabel>
          <input
            type="text"
            value={contractorName}
            onChange={(e) => setContractorName(e.target.value)}
            placeholder="ABC Plumbing Inc."
            style={fieldStyle}
            disabled={submitting}
          />

          <FieldLabel>Total Bid Amount *</FieldLabel>
          <input
            type="number"
            value={totalPrice}
            onChange={(e) => setTotalPrice(e.target.value)}
            placeholder="e.g. 12500"
            style={fieldStyle}
            disabled={submitting}
            min="0"
            step="0.01"
          />

          {trade?.lineItems?.length > 0 && (
            <>
              <FieldLabel>Line-Item Pricing (optional)</FieldLabel>
              <div style={{ border: "1px solid #e0e4ef", borderRadius: 6, padding: 4, marginBottom: 16 }}>
                {trade.lineItems.map((li, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: i < trade.lineItems.length - 1 ? "1px solid #f0f2f5" : "none" }}>
                    <div style={{ flex: 1, fontSize: 13, color: "#1a1f2e", paddingRight: 12 }}>{li.description}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 13, color: "#909ab0" }}>$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={lineItemPrices[i] || ""}
                        onChange={(e) => setLineItemPrices({ ...lineItemPrices, [i]: e.target.value })}
                        disabled={submitting}
                        min="0"
                        step="0.01"
                        style={{ width: 110, padding: "6px 8px", border: "1px solid #d0d4dc", borderRadius: 4, fontSize: 13, fontFamily: "monospace", textAlign: "right" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <FieldLabel>Inclusions (optional)</FieldLabel>
          <textarea
            value={inclusions}
            onChange={(e) => setInclusions(e.target.value)}
            placeholder="What's specifically included in your bid (materials, brands, labor scope, etc.)"
            style={{ ...fieldStyle, minHeight: 80 }}
            disabled={submitting}
          />

          <FieldLabel>Exclusions (optional)</FieldLabel>
          <textarea
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
            placeholder="What's NOT in your bid (e.g. permits, demo, hauling)"
            style={{ ...fieldStyle, minHeight: 80 }}
            disabled={submitting}
          />

          <FieldLabel>Notes for the GC (optional)</FieldLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Lead time, alternate options, clarifying questions…"
            style={{ ...fieldStyle, minHeight: 80 }}
            disabled={submitting}
          />

          {totalPrice !== "" && Number(totalPrice) > 0 && (
            <div style={{ background: "#1a1f2e", padding: "16px 20px", borderRadius: 6, marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#fff", fontWeight: "bold" }}>Your Total Bid</span>
              <span style={{ color: "#f0a500", fontSize: 22, fontFamily: "monospace" }}>{fmt(totalPrice)}</span>
            </div>
          )}

          {submitError && (
            <div style={{ background: "#fff0f0", border: "1px solid #e74c3c", padding: "10px 14px", borderRadius: 6, fontSize: 13, color: "#e74c3c", marginTop: 16 }}>
              {submitError}
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || totalPrice === "" || Number(totalPrice) <= 0}
            style={{
              width: "100%", marginTop: 24,
              background: "#27ae60", color: "#fff", border: "none",
              padding: "16px 24px", borderRadius: 6, fontSize: 15, fontWeight: "bold",
              cursor: submitting ? "wait" : "pointer", opacity: (totalPrice === "" || Number(totalPrice) <= 0) ? 0.5 : 1,
            }}
          >
            {submitting ? "Submitting…" : "✓ Submit Bid"}
          </button>
          <div style={{ fontSize: 11, color: "#909ab0", marginTop: 10, textAlign: "center" }}>
            By submitting, you confirm this bid is valid and based on the scope above.
          </div>
        </div>

        <div style={{ background: "#f0f2f5", padding: "12px 20px", borderRadius: "0 0 8px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#909ab0" }}>Powered by JobSiteGPT · Construction AI Suite</div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#909ab0", textTransform: "uppercase", margin: "0 0 10px", fontWeight: 700 }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#606880", marginBottom: 6, marginTop: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {children}
    </label>
  );
}

function BulletSection({ title, items }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionLabel>{title}</SectionLabel>
      <ul style={{ margin: 0, paddingLeft: 20, color: "#1a1f2e" }}>
        {items.map((x, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4 }}>{x}</li>)}
      </ul>
    </div>
  );
}

const fieldStyle = {
  width: "100%", padding: "10px 12px", border: "1px solid #d0d4dc",
  borderRadius: 6, fontSize: 14, marginBottom: 14, fontFamily: "inherit",
  boxSizing: "border-box",
};

const centeredPage = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Arial, sans-serif",
  background: "#f8f9fc",
};
