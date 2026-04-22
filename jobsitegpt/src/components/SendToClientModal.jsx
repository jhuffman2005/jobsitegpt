import { useState, useEffect } from "react";

export default function SendToClientModal({
  isOpen,
  onClose,
  onSend,
  projectName,
  docType = "Document",
}) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setClientName("");
      setClientEmail("");
      setSending(false);
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, sending, onClose]);

  if (!isOpen) return null;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim());
  const canSend = clientName.trim() && emailValid && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError("");
    try {
      await onSend({ clientName: clientName.trim(), clientEmail: clientEmail.trim() });
    } catch (e) {
      setError(e?.message || "Failed to send email");
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !sending && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Send {docType} to Client</div>
        {projectName && <div className="modal-sub">{projectName}</div>}
        <div className="modal-body">
          <label className="field-label">Client Name *</label>
          <input
            type="text"
            placeholder="e.g. Sarah Johnson"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            disabled={sending}
            autoFocus
          />
          <label className="field-label">Client Email *</label>
          <input
            type="email"
            placeholder="client@example.com"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            disabled={sending}
            onKeyDown={(e) => { if (e.key === "Enter" && canSend) handleSend(); }}
          />
          {error && <div className="error-box" style={{ marginTop: 12 }}>⚠ {error}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSend} disabled={!canSend}>
            {sending ? "Sending…" : "✉ Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
