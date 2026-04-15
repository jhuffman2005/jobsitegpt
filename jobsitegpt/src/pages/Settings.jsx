import { useState, useEffect } from "react";
import { callClaude } from "../lib/api";
import {
  getUserCostCodes, saveUserCostCodes,
  getUserSettings, saveUserSettings,
} from "../lib/projects";
import { useToast } from "../lib/hooks";

const DEFAULT_COST_CODES = [
  "Cabinets","Cleanup","Concrete","Countertops","Demolition","Drywall",
  "Electrical","Equipment Rental","Exterior","Fixtures & Hardware","Flooring",
  "Framing","HVAC","Insulation","Labor","Landscaping","Miscellaneous",
  "Painting","Permits & Fees","Plumbing","Roofing","Site Work","Tile",
  "Trim & Finish","Windows & Doors",
];

export default function Settings() {
  const [contractorEmail, setContractorEmail] = useState("");
  const [codes, setCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [settings, savedCodes] = await Promise.all([
          getUserSettings(),
          getUserCostCodes(),
        ]);
        setContractorEmail(settings.contractor_email || "");
        setCodes(savedCodes.length ? savedCodes : [...DEFAULT_COST_CODES]);
      } catch (e) {
        console.error("Settings load error:", e);
        setCodes([...DEFAULT_COST_CODES]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveUserSettings({ contractor_email: contractorEmail }),
        saveUserCostCodes(codes),
      ]);
      showToast("Settings saved!");
    } catch (e) {
      showToast("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const addCode = () => {
    const c = newCode.trim();
    if (!c || codes.includes(c)) return;
    setCodes((p) => [...p, c].sort());
    setNewCode("");
  };

  const removeCode = (code) => setCodes((p) => p.filter((c) => c !== code));

  const importCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result
        .split(/[\r\n]+/)
        .map((l) => l.split(",")[0].replace(/["']/g, "").trim())
        .filter(Boolean);
      setCodes((prev) => [...new Set([...prev, ...lines])].sort());
      showToast(`Imported ${lines.length} codes`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const suggestCodes = async () => {
    setAiLoading(true);
    try {
      const r = await callClaude(
        [{
          role: "user",
          content: `Generate a comprehensive construction cost code list for a residential/commercial GC. Include 50 codes covering all typical trades. Return ONLY valid JSON:\n{"codes":["string","string"]}`,
        }],
        "You are a construction cost accountant. Return a list of 50 standard construction cost codes. Return valid JSON only, no markdown.",
        2000
      );
      if (r.codes?.length) {
        setCodes((prev) => [...new Set([...prev, ...r.codes])].sort());
        showToast(`Added ${r.codes.length} AI-suggested codes`);
      }
    } catch (e) {
      showToast("AI suggestion failed: " + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ color: "#909ab0", fontFamily: "'Inter',sans-serif", fontSize: 13 }}>
        Loading settings…
      </div>
    );
  }

  return (
    <div className="fade-up">
      {/* Account Section */}
      <div className="section-label">Account</div>
      <div className="input-group" style={{ maxWidth: 500 }}>
        <label className="field-label">Contractor Email (for signed change orders)</label>
        <input
          type="email"
          placeholder="you@yourcompany.com"
          value={contractorEmail}
          onChange={(e) => setContractorEmail(e.target.value)}
        />
        <div style={{ fontSize: 11, color: "#909ab0", fontFamily: "'Inter',sans-serif", marginTop: 6 }}>
          When a client approves a change order, a signed copy is sent to this address.
        </div>
      </div>

      {/* Cost Codes Section */}
      <div className="section-label" style={{ marginTop: 32 }}>Cost Codes — FieldLedger</div>
      <div style={{ fontSize: 13, color: "#606880", marginBottom: 16 }}>
        These cost codes appear in FieldLedger's autocomplete. Import from QuickBooks, add manually, or let AI suggest a standard list.
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <label className="btn" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          ⬆ Import CSV
          <input type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={importCSV} />
        </label>
        <button className="btn" disabled={aiLoading} onClick={suggestCodes}>
          {aiLoading ? "Generating…" : "✦ AI Suggestions"}
        </button>
        <button className="btn btn-ghost" onClick={() => setCodes([...DEFAULT_COST_CODES])}>
          Reset to Defaults
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Add a cost code…"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCode()}
          style={{ flex: 1, maxWidth: 340 }}
        />
        <button className="btn btn-primary" disabled={!newCode.trim()} onClick={addCode}>
          + Add
        </button>
        <span style={{ fontSize: 12, color: "#c47f00", fontFamily: "'Inter',sans-serif", fontStyle: "italic" }}>
          ↑ Don't forget to click "Save Settings" below to save your changes
        </span>
      </div>

      <div style={{
        background: "#ffffff", border: "1px solid #e0e4ef", borderRadius: 8,
        maxHeight: 380, overflowY: "auto", marginBottom: 8,
      }}>
        {codes.length === 0 ? (
          <div style={{ padding: "28px 20px", textAlign: "center", color: "#909ab0", fontSize: 13 }}>
            No cost codes yet. Import, add manually, or use AI suggestions.
          </div>
        ) : (
          codes.map((code) => (
            <div
              key={code}
              style={{
                display: "flex", alignItems: "center", padding: "9px 16px",
                borderBottom: "1px solid #f0f2f5", gap: 12,
              }}
            >
              <span style={{ flex: 1, fontSize: 13, color: "#1a1f2e" }}>{code}</span>
              <span
                style={{ cursor: "pointer", color: "#c0c8d8", fontSize: 13, lineHeight: 1 }}
                onClick={() => removeCode(code)}
              >✕</span>
            </div>
          ))
        )}
      </div>
      <div style={{ fontSize: 11, color: "#909ab0", fontFamily: "'Inter',sans-serif", marginBottom: 28 }}>
        {codes.length} cost codes
      </div>

      <button
        className="btn btn-primary btn-lg"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving…" : "Save Settings"}
      </button>

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
