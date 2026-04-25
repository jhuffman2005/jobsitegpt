import { useState, useEffect } from "react";

// Modal that lists every trade in a generated scope and lets the GC enter a
// contact name + email for each one. On send, the parent fans out one bid
// invitation per trade (each gets only its own scope). Trades with a blank
// email are skipped — partial sends are useful (e.g. send to electric +
// plumbing today, the rest later).
export default function SendToTradesModal({
  isOpen,
  onClose,
  onSend,
  scope,             // full scope result_data { projectName, trades, ... }
  alreadyInvited,    // Map<tradeName, count> of invites already on file
}) {
  const [rows, setRows] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (!isOpen || !scope?.trades) return;
    setRows(scope.trades.map((t) => ({
      tradeName: t.tradeName,
      contractor: t.contractor || "",
      contactName: "",
      email: "",
      lineItemCount: t.lineItems?.length || 0,
      sent: false,
      errorMsg: "",
    })));
    setSending(false);
    setError("");
    setResults(null);
  }, [isOpen, scope]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, sending, onClose]);

  if (!isOpen) return null;

  const update = (i, field, val) =>
    setRows((p) => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());
  const toSend = rows.filter((r) => validEmail(r.email));
  const canSend = toSend.length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError("");
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!validEmail(r.email)) { out.push({ ...r, status: "skipped" }); continue; }
      try {
        await onSend({
          tradeName: r.tradeName,
          contractor: r.contractor,
          contactName: r.contactName.trim() || null,
          email: r.email.trim(),
        });
        out.push({ ...r, status: "sent" });
        update(i, "sent", true);
      } catch (e) {
        out.push({ ...r, status: "error", errorMsg: e?.message || "Failed" });
        update(i, "errorMsg", e?.message || "Failed");
      }
    }
    setResults(out);
    setSending(false);
  };

  const sentCount = results?.filter((r) => r.status === "sent").length ?? 0;
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="modal-backdrop" onClick={() => !sending && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">Send Scope to Trades for Bidding</div>
        {scope?.projectName && <div className="modal-sub">{scope.projectName}</div>}

        <div className="modal-body">
          <div style={{ fontSize: 12, color: "#606880", marginBottom: 14, lineHeight: 1.6 }}>
            Each trade gets a unique link to a page showing only their portion of the scope, where they can enter pricing and submit a bid. Submitted bids show up in BidMatch for side-by-side comparison.
          </div>

          {rows.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#909ab0", fontSize: 13 }}>
              This scope has no trades to send.
            </div>
          )}

          {rows.map((r, i) => {
            const invitedBefore = alreadyInvited?.get(r.tradeName) || 0;
            return (
              <div
                key={i}
                style={{
                  padding: "14px 16px",
                  marginBottom: 12,
                  background: r.sent ? "rgba(39,174,96,0.06)" : "#f8f9fc",
                  border: `1px solid ${r.sent ? "rgba(39,174,96,0.3)" : "#e0e4ef"}`,
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>
                      {r.tradeName}
                    </div>
                    <div style={{ fontSize: 11, color: "#909ab0", marginTop: 2 }}>
                      {r.contractor && <>{r.contractor} · </>}{r.lineItemCount} line items
                      {invitedBefore > 0 && <> · <span style={{ color: "#c47f00" }}>previously invited {invitedBefore}×</span></>}
                    </div>
                  </div>
                  {r.sent && <span style={{ color: "#27ae60", fontSize: 12, fontWeight: 700 }}>✓ Sent</span>}
                  {r.errorMsg && <span style={{ color: "#e74c3c", fontSize: 11 }}>⚠ {r.errorMsg}</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Contact name (optional)"
                    value={r.contactName}
                    onChange={(e) => update(i, "contactName", e.target.value)}
                    disabled={sending || r.sent}
                  />
                  <input
                    type="email"
                    placeholder="trade@example.com"
                    value={r.email}
                    onChange={(e) => update(i, "email", e.target.value)}
                    disabled={sending || r.sent}
                  />
                </div>
              </div>
            );
          })}

          {error && <div className="error-box" style={{ marginTop: 8 }}>⚠ {error}</div>}

          {results && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: errorCount ? "rgba(231,76,60,0.07)" : "rgba(39,174,96,0.07)",
                border: `1px solid ${errorCount ? "rgba(231,76,60,0.25)" : "rgba(39,174,96,0.25)"}`,
                borderRadius: 6,
                fontSize: 13,
                color: "#1a1f2e",
              }}
            >
              {sentCount} invitation{sentCount === 1 ? "" : "s"} sent
              {errorCount > 0 && <> · <span style={{ color: "#e74c3c" }}>{errorCount} failed</span></>}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={sending}>
            {results ? "Close" : "Cancel"}
          </button>
          {!results?.every?.((r) => r.status !== "error") || !results ? (
            <button className="btn btn-primary" onClick={handleSend} disabled={!canSend}>
              {sending ? "Sending…" : `✉ Send to ${toSend.length} Trade${toSend.length === 1 ? "" : "s"}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
