import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getApproval } from "../lib/projects";

const fmt = (p) =>
  `$${Number(p || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Approve() {
  const { token } = useParams();
  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [actionStatus, setActionStatus] = useState("idle"); // idle | working | approved | declined
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getApproval(token);
        setApproval(data);
        if (data.status !== "pending") setActionStatus(data.status);
      } catch {
        setFetchError("This approval link is invalid or has expired.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleApprove = async () => {
    setActionStatus("working");
    setActionError("");
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: "approved" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      // Email contractor if address is stored on the record
      const contractorEmail = data.contractor_email || approval?.contractor_email;
      if (contractorEmail) {
        const r = approval.co_data;
        await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: contractorEmail,
            subject: `✓ Signed: Change Order #${r.changeOrderNumber} — ${r.title}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
                <div style="background:#27ae60;padding:18px 24px;border-radius:8px 8px 0 0">
                  <div style="color:rgba(255,255,255,0.8);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px">Change Order Approved</div>
                  <div style="color:#fff;font-size:22px;font-weight:bold;font-family:Arial,sans-serif">✓ ${r.title}</div>
                  <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px">${r.projectName} · ${r.clientName} · ${new Date().toLocaleDateString()}</div>
                </div>
                <div style="background:#f8f9fc;padding:24px;border:1px solid #e0e4ef;border-top:none">
                  <p style="color:#1a1f2e;font-size:14px;line-height:1.6;margin-bottom:16px">
                    Your client has approved <strong>Change Order #${r.changeOrderNumber}</strong>.
                  </p>
                  <div style="background:#1a1f2e;padding:16px 20px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                    <span style="color:#fff;font-size:15px;font-weight:bold">Total Approved Amount</span>
                    <span style="color:#f0a500;font-size:22px;font-family:monospace">${fmt(r.totalAmount)}</span>
                  </div>
                  <p style="color:#606880;font-size:12px;margin-bottom:8px">Schedule Impact: +${r.daysAdded} calendar days</p>
                  <p style="color:#606880;font-size:12px;font-style:italic;border-left:3px solid #e0e4ef;padding-left:12px;margin-top:16px">${r.contractLanguage}</p>
                </div>
                <div style="background:#f0f2f5;padding:12px 20px;border-radius:0 0 8px 8px;text-align:center">
                  <div style="font-size:11px;color:#909ab0">Sent via JobSiteGPT · Construction AI Suite</div>
                </div>
              </div>
            `,
            from_name: "JobSiteGPT",
          }),
        });
      }

      setActionStatus("approved");
    } catch (e) {
      setActionError("Something went wrong. Please try again.");
      setActionStatus("idle");
    }
  };

  const handleDecline = async () => {
    setActionStatus("working");
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: "declined" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Update failed");
      }
      setActionStatus("declined");
    } catch (e) {
      setActionError("Something went wrong. Please try again.");
      setActionStatus("idle");
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={centeredPage}>
        <div style={{ color: "#909ab0", fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Loading…</div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
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

  const r = approval.co_data;

  // ── Already Approved ─────────────────────────────────────────────────────
  if (actionStatus === "approved") {
    return (
      <div style={{ ...centeredPage, background: "#f8f9fc" }}>
        <div style={{ maxWidth: 480, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 16, color: "#27ae60" }}>✓</div>
          <div style={{ fontWeight: 800, fontSize: 26, color: "#27ae60", marginBottom: 8, fontFamily: "Arial, sans-serif" }}>Change Order Approved!</div>
          <div style={{ fontSize: 14, color: "#606880", marginBottom: 28 }}>
            Your contractor has been notified. This change order is now authorized.
          </div>
          <div style={{ background: "#fff", border: "1px solid #e0e4ef", borderRadius: 8, padding: "18px 24px" }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, fontFamily: "Arial, sans-serif" }}>{r.title}</div>
            <div style={{ fontSize: 13, color: "#909ab0" }}>CO #{r.changeOrderNumber} · {fmt(r.totalAmount)}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Declined ─────────────────────────────────────────────────────────────
  if (actionStatus === "declined") {
    return (
      <div style={{ ...centeredPage, background: "#f8f9fc" }}>
        <div style={{ maxWidth: 480, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 36, color: "#e74c3c", marginBottom: 12 }}>✕</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: "#1a1f2e", marginBottom: 8, fontFamily: "Arial, sans-serif" }}>Change Order Declined</div>
          <div style={{ fontSize: 13, color: "#606880" }}>
            Your contractor has been notified. No changes have been made to the contract.
          </div>
        </div>
      </div>
    );
  }

  // ── Approval Form ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: "Arial, sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: "#1a1f2e", padding: "20px 24px", borderRadius: "8px 8px 0 0" }}>
          <div style={{ color: "#f0a500", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            Change Order #{r.changeOrderNumber} · Approval Required
          </div>
          <div style={{ color: "#fff", fontSize: 24, fontWeight: "bold" }}>{r.title}</div>
          <div style={{ color: "#909ab0", fontSize: 13, marginTop: 4 }}>
            {r.projectName} · {r.clientName} · {r.date}
          </div>
        </div>

        {/* Body */}
        <div style={{ background: "#fff", padding: "28px", border: "1px solid #e0e4ef", borderTop: "none" }}>
          <p style={{ fontSize: 14, color: "#1a1f2e", lineHeight: 1.6, marginBottom: 12 }}>{r.description}</p>
          <p style={{ fontSize: 13, color: "#606880", marginBottom: 24 }}>
            <strong>Reason:</strong> {r.reason}
          </p>

          {/* Line items */}
          {r.lineItems?.map((li, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f2f5" }}>
              <div>
                <div style={{ fontSize: 13, color: "#1a1f2e" }}>{li.description}</div>
                <div style={{ fontSize: 11, color: "#909ab0", marginTop: 2 }}>
                  {li.trade} · {li.quantity} {li.unit} @ {fmt(li.unitPrice)}
                </div>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>{fmt(li.totalPrice)}</div>
            </div>
          ))}

          {/* Total */}
          <div style={{ background: "#1a1f2e", padding: "16px 20px", borderRadius: 6, marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#fff", fontWeight: "bold" }}>Total Change Order Amount</span>
            <span style={{ color: "#f0a500", fontSize: 22, fontFamily: "monospace" }}>{fmt(r.totalAmount)}</span>
          </div>
          <div style={{ fontSize: 12, color: "#909ab0", marginTop: 8 }}>
            Schedule Impact: +{r.daysAdded} calendar days
          </div>

          {/* Contract language */}
          <div style={{ fontStyle: "italic", fontSize: 12, color: "#606880", lineHeight: 1.7, marginTop: 20, padding: "12px 16px", background: "#f8f9fc", borderRadius: 6, borderLeft: "3px solid #e0e4ef" }}>
            {r.contractLanguage}
          </div>

          {actionError && (
            <div style={{ background: "#fff0f0", border: "1px solid #e74c3c", padding: "10px 14px", borderRadius: 6, fontSize: 13, color: "#e74c3c", marginTop: 16 }}>
              {actionError}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            <button
              onClick={handleApprove}
              disabled={actionStatus === "working"}
              style={{
                flex: 2, background: "#27ae60", color: "#fff", border: "none",
                padding: "16px 24px", borderRadius: 6, fontSize: 15, fontWeight: "bold",
                cursor: actionStatus === "working" ? "wait" : "pointer",
              }}
            >
              {actionStatus === "working" ? "Processing…" : "✓ Approve Change Order"}
            </button>
            <button
              onClick={handleDecline}
              disabled={actionStatus === "working"}
              style={{
                flex: 1, background: "transparent", color: "#e74c3c",
                border: "1px solid rgba(231,76,60,0.3)", padding: "16px", borderRadius: 6,
                fontSize: 13, cursor: "pointer",
              }}
            >
              Decline
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#909ab0", marginTop: 10, textAlign: "center" }}>
            By clicking Approve, you authorize this change order and agree to the additional cost and schedule impact.
          </div>
        </div>

        <div style={{ background: "#f0f2f5", padding: "12px 20px", borderRadius: "0 0 8px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#909ab0" }}>Powered by JobSiteGPT · Construction AI Suite</div>
        </div>
      </div>
    </div>
  );
}

const centeredPage = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Arial, sans-serif",
  background: "#f8f9fc",
};
