// Project-setup upload component for an existing scope or schedule.
// Same UI for both document types — `type` prop switches the wording, the
// API calls, and the structuring/save targets.
//
// Flow:
//   1) Source     — pick a file OR paste text (one or the other)
//   2) Path       — pick "Use as-is" or "Generate full from this"
//   3) Processing — call api/generate.js (via callClaude)
//   4) Preview    — show counts + expandable items + Accept / Re-do
//   5) Save       — write to projects.scope_*  /  schedule_* columns

import { useState, useMemo } from "react";
import {
  parseScopeFromSource, generateScopeFromSource,
  parseScheduleFromSource, generateScheduleFromSource,
  isAllowedUploadFile,
} from "../lib/scopeScheduleUpload";
import {
  ensureStructuredScope, ensureStructuredSchedule,
  structureFromUploadScope, structureFromUploadSchedule,
} from "../lib/structuredData";
import { saveActiveScope, saveActiveSchedule, saveGeneration } from "../lib/projects";

export default function ScopeOrScheduleUpload({
  type,                // "scope" | "schedule"
  projectId,
  projectName = "",
  hasExistingContent = false, // true if active columns already have data
  onAccepted,          // callback fired after save succeeds
}) {
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);

  // step: "source" → "choose-path" → "processing" → "preview" | "error"
  const [step, setStep] = useState("source");
  const [chosenPath, setChosenPath] = useState(null);    // "use_as_is" | "generate"
  const [rawResponse, setRawResponse] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [legacyResult, setLegacyResult] = useState(null); // raw API output (used for project_generations row on GENERATE)
  const [structured, setStructured] = useState(null);     // structured shape to save
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const label = type === "scope" ? "scope" : "schedule";
  const Label = type === "scope" ? "Scope" : "Schedule";

  const hasSource = !!file || !!pastedText.trim();
  const sourceLocked = !!file && !!pastedText.trim(); // shouldn't happen — UI disables one when the other is set

  const reset = (toStep = "source") => {
    setStep(toStep);
    setChosenPath(null);
    setLegacyResult(null);
    setStructured(null);
    setErrorMsg("");
    setRawResponse("");
    setExpanded(false);
  };

  const onFilePick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!isAllowedUploadFile(f)) {
      setErrorMsg("Unsupported file type. Use PDF, DOCX, or XLSX.");
      return;
    }
    setFile(f);
    setPastedText("");
    setPasteOpen(false);
    setErrorMsg("");
  };

  const clearSource = () => {
    setFile(null);
    setPastedText("");
    setPasteOpen(false);
    reset("source");
  };

  const goToPathPick = () => {
    if (!hasSource) return;
    setErrorMsg("");
    setStep("choose-path");
  };

  const runProcessing = async (path) => {
    setChosenPath(path);
    setStep("processing");
    setErrorMsg("");
    setRawResponse("");
    try {
      const args = { file, text: pastedText };
      let api;
      if (type === "scope") {
        api = path === "use_as_is" ? parseScopeFromSource(args) : generateScopeFromSource(args);
      } else {
        api = path === "use_as_is" ? parseScheduleFromSource(args) : generateScheduleFromSource(args);
      }
      const result = await api;
      setRawResponse(JSON.stringify(result, null, 2));

      let structuredResult;
      if (type === "scope") {
        structuredResult = path === "use_as_is"
          ? structureFromUploadScope(result, "uploaded")
          : ensureStructuredScope(result);
      } else {
        structuredResult = path === "use_as_is"
          ? structureFromUploadSchedule(result, "uploaded")
          : ensureStructuredSchedule(result);
      }
      if (!structuredResult) throw new Error("Could not structure the response.");

      setLegacyResult(result);
      setStructured(structuredResult);
      setStep("preview");
    } catch (e) {
      setErrorMsg(e?.message || "Processing failed.");
      setStep("error");
    }
  };

  const accept = async () => {
    if (!structured) return;
    if (hasExistingContent && !window.confirm(
      `This project already has ${label} data. Importing will replace it. Continue?`
    )) return;

    setSaving(true);
    try {
      if (type === "scope") {
        await saveActiveScope(projectId, {
          scope_trades: structured.scope_trades || [],
          scope_notes: structured.scope_notes || { generalConditions: [], exclusions: [], clarifications: [] },
        });
        if (chosenPath === "generate") {
          // GENERATE writes a history row too, mirroring the in-tool Generate flow.
          await saveGeneration(
            projectId, "ScopeGPT",
            legacyResult?.projectName || projectName,
            legacyResult?.overview || "",
            legacyResult
          );
        }
      } else {
        await saveActiveSchedule(projectId, {
          schedule_tasks: structured.schedule_tasks || [],
          schedule_phases: structured.schedule_phases || [],
          schedule_subcontractors: structured.schedule_subcontractors || [],
        });
        if (chosenPath === "generate") {
          await saveGeneration(
            projectId, "ScheduleGPT",
            legacyResult?.projectName || projectName,
            `${(legacyResult?.tasks || []).length} tasks · ${(legacyResult?.phases || []).length} phases · ${legacyResult?.totalDays || 0} days`,
            legacyResult
          );
        }
      }
      onAccepted?.({ type, path: chosenPath, structured });
      clearSource();
    } catch (e) {
      setErrorMsg("Save failed: " + (e?.message || "unknown error"));
      setStep("error");
    } finally {
      setSaving(false);
    }
  };

  // Preview counts — read off the structured shape so what you see is what
  // will be saved.
  const preview = useMemo(() => {
    if (!structured) return null;
    if (type === "scope") {
      const tradeCount = (structured.scope_trades || []).length;
      const lineCount = (structured.scope_trades || []).reduce((n, t) => n + (t.lineItems?.length || 0), 0);
      const n = structured.scope_notes || {};
      return {
        primary: `${tradeCount} trade${tradeCount === 1 ? "" : "s"} · ${lineCount} line item${lineCount === 1 ? "" : "s"}`,
        secondary: `General Conditions: ${n.generalConditions?.length || 0} · Exclusions: ${n.exclusions?.length || 0} · Clarifications: ${n.clarifications?.length || 0}`,
      };
    }
    const tasks = (structured.schedule_tasks || []).length;
    const phases = (structured.schedule_phases || []).length;
    const subs = (structured.schedule_subcontractors || []).length;
    return {
      primary: `${tasks} task${tasks === 1 ? "" : "s"} · ${phases} phase${phases === 1 ? "" : "s"}`,
      secondary: `Subcontractor rows: ${subs}`,
    };
  }, [structured, type]);

  return (
    <div className="upload-import-card">
      <div className="upload-import-title">
        Import Existing {Label}
        <span className="upload-import-optional">optional</span>
      </div>
      <div className="upload-import-desc">
        Have an existing {label}, rough notes, or a planset? Upload it or paste it. You'll get to choose whether to use it as-is or have AI generate a full {label} using it as a starting point.
      </div>

      {/* Step 1: Source */}
      {step === "source" && (
        <>
          {file ? (
            <div className="upload-source-row">
              <span style={{ fontSize: 18 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="upload-source-name">{file.name}</div>
                <div className="upload-source-meta">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <button type="button" className="btn btn-ghost" onClick={clearSource}>✕ Clear</button>
            </div>
          ) : (
            <>
              <label className="btn upload-pick-btn">
                ⬆ Pick file (PDF, DOCX, XLSX)
                <input
                  type="file"
                  accept=".pdf,.docx,.xlsx"
                  style={{ display: "none" }}
                  onChange={onFilePick}
                  disabled={!!pastedText.trim()}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost upload-paste-toggle"
                onClick={() => setPasteOpen((v) => !v)}
              >
                {pasteOpen ? "− Cancel paste" : "✎ or paste text"}
              </button>
              {pasteOpen && (
                <textarea
                  className="upload-paste-area"
                  placeholder={`Paste an existing ${label} here — rough notes, a quote, anything…`}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  autoFocus
                />
              )}
            </>
          )}
          {hasSource && (
            <div className="upload-actions-row">
              <button type="button" className="btn btn-primary" onClick={goToPathPick}>
                Continue →
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 2: Path choice */}
      {step === "choose-path" && (
        <div className="upload-paths">
          <button type="button" className="upload-path-card" onClick={() => runProcessing("use_as_is")}>
            <div className="upload-path-title">Use as-is</div>
            <div className="upload-path-desc">Import this document exactly as written — trade groupings, line items, notes. No interpretation.</div>
          </button>
          <button type="button" className="upload-path-card" onClick={() => runProcessing("generate")}>
            <div className="upload-path-title">Generate full {label} from this</div>
            <div className="upload-path-desc">Let AI build a complete, professional {label} using this as the starting point. Same as the in-tool Generate, but seeded from your upload.</div>
          </button>
          <div className="upload-actions-row">
            <button type="button" className="btn btn-ghost" onClick={() => setStep("source")}>← Back</button>
          </div>
        </div>
      )}

      {/* Step 3: Processing */}
      {step === "processing" && (
        <div className="upload-processing">
          <div className="upload-spinner">⏳</div>
          <div>{chosenPath === "use_as_is" ? `Importing ${label}…` : `Generating ${label} from your upload…`}</div>
          <div className="upload-processing-sub">This usually takes 20–60 seconds.</div>
        </div>
      )}

      {/* Step 4: Preview */}
      {step === "preview" && preview && (
        <div className="upload-preview">
          <div className="upload-preview-pill">
            {chosenPath === "use_as_is" ? "Imported as-is" : "AI-generated from your upload"}
          </div>
          <div className="upload-preview-primary">{preview.primary}</div>
          <div className="upload-preview-secondary">{preview.secondary}</div>

          <details className="upload-details" open={expanded} onToggle={(e) => setExpanded(e.target.open)}>
            <summary>View items</summary>
            {type === "scope" ? <ScopePreview structured={structured} /> : <SchedulePreview structured={structured} />}
          </details>

          <div className="upload-actions-row">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={accept}>
              {saving ? "Saving…" : `Accept and save to project`}
            </button>
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => reset("choose-path")}>
              ↻ Re-do
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Error */}
      {step === "error" && (
        <div className="upload-error">
          <div className="upload-error-msg">⚠ {errorMsg || "Something went wrong."}</div>
          {rawResponse && (
            <details className="upload-details">
              <summary>View raw response</summary>
              <pre className="upload-raw-pre">{rawResponse}</pre>
            </details>
          )}
          <div className="upload-error-fallback">
            Couldn't process this automatically. You can start with a blank {label} and add items manually in {Label}GPT after saving the project.
          </div>
          <div className="upload-actions-row">
            <button type="button" className="btn btn-ghost" onClick={() => reset("choose-path")}>← Try again</button>
            <button type="button" className="btn btn-ghost" onClick={clearSource}>✕ Discard</button>
          </div>
        </div>
      )}

      {errorMsg && step !== "error" && (
        <div className="error-box" style={{ marginTop: 10 }}>⚠ {errorMsg}</div>
      )}
    </div>
  );
}

function ScopePreview({ structured }) {
  const trades = structured?.scope_trades || [];
  const notes = structured?.scope_notes || {};
  return (
    <div className="upload-preview-list">
      {trades.map((t) => (
        <div key={t.id} className="upload-preview-trade">
          <div className="upload-preview-trade-name">{t.tradeName || "(unnamed trade)"}</div>
          {t.contractor && <div className="upload-preview-trade-meta">{t.contractor}</div>}
          {t.scopeText && <div className="upload-preview-trade-text">{t.scopeText}</div>}
          {!!t.lineItems?.length && (
            <ul className="upload-preview-li-list">
              {t.lineItems.map((li) => (
                <li key={li.id}>{li.description}{li.note ? ` — ${li.note}` : ""}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {["generalConditions", "exclusions", "clarifications"].map((k) =>
        notes[k]?.length ? (
          <div key={k} className="upload-preview-notes">
            <div className="upload-preview-notes-title">{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</div>
            <ul className="upload-preview-li-list">
              {notes[k].map((n) => <li key={n.id}>{n.text}</li>)}
            </ul>
          </div>
        ) : null
      )}
    </div>
  );
}

function SchedulePreview({ structured }) {
  const tasks = structured?.schedule_tasks || [];
  const phases = structured?.schedule_phases || [];
  const subs = structured?.schedule_subcontractors || [];
  return (
    <div className="upload-preview-list">
      {!!phases.length && (
        <div className="upload-preview-phases">
          <span className="upload-preview-notes-title">Phases:</span> {phases.join(" · ")}
        </div>
      )}
      <table className="upload-preview-tasks">
        <thead>
          <tr><th>Task</th><th>Phase</th><th>Trade</th><th>Start</th><th>Days</th></tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>{t.task}</td>
              <td>{t.phase}</td>
              <td>{t.trade}</td>
              <td>{t.startDay}</td>
              <td>{t.durationDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!!subs.length && (
        <div className="upload-preview-notes">
          <div className="upload-preview-notes-title">Subcontractor worksheet ({subs.length})</div>
          <ul className="upload-preview-li-list">
            {subs.map((s, i) => <li key={i}>{s.trade}{s.phase ? ` · ${s.phase}` : ""}{s.estimatedDays ? ` · ${s.estimatedDays}d` : ""}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
