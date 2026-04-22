import { useState, useRef, useEffect } from "react";
import { getProjectFiles, getProjectFileAsBase64 } from "../lib/projects";

export function ProcessingSteps({ steps, idx, hint = "This usually takes 1–2 minutes — hang tight." }) {
  return (
    <div className="processing-wrap fade-up">
      <div className="processing-label">PROCESSING…</div>
      <div className="step-list">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`step-row ${i < idx ? "done" : i === idx ? "active" : "pending"}`}
          >
            <span className="step-dot">
              {i < idx ? "✓" : i === idx ? "●" : "○"}
            </span>
            {s}
          </div>
        ))}
      </div>
      {hint && <div className="processing-hint">{hint}</div>}
    </div>
  );
}

export function UploadZone({ files, onAdd, onRemove, hint = "PDF · JPG · PNG" }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef(null);

  return (
    <>
      <div
        className={`upload-zone${drag ? " drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onAdd(e.dataTransfer.files); }}
        onClick={() => ref.current?.click()}
      >
        <input
          ref={ref}
          type="file"
          multiple
          accept=".pdf,.docx,.json,image/*"
          onChange={(e) => onAdd(e.target.files)}
          onClick={(e) => e.stopPropagation()}
        />
        <div style={{ fontSize: 26, marginBottom: 8 }}>📎</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: "var(--muted, #6b7599)" }}>
          Drop files or click to upload
        </div>
        <div style={{ fontSize: 11, color: "#3a4260", fontFamily: "'Inter', sans-serif", marginTop: 5 }}>
          {hint}
        </div>
      </div>

      {files.length > 0 && (
        <div className="file-chips">
          {files.map((f) => (
            <div key={f.name} className="file-chip">
              {f.type?.startsWith("image/") ? "🖼" : "📄"} {f.name}
              <span className="file-chip-x" onClick={() => onRemove(f.name)}>✕</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Shows files already uploaded to the active project as selectable chips.
 * Parent manages selection state and base64 loading.
 *
 * Props:
 *   projectId       — active project id (or null)
 *   selectedIds     — array of selected file IDs
 *   loadingIds      — Set of file IDs currently loading base64
 *   onToggle(file)  — called when a chip is clicked; parent fetches b64
 */
export function ProjectFilePicker({ projectId, selectedIds, loadingIds, onToggle }) {
  const [files, setFiles] = useState([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!projectId) { setFiles([]); return; }
    setFetching(true);
    getProjectFiles(projectId)
      .then(setFiles)
      .catch(console.error)
      .finally(() => setFetching(false));
  }, [projectId]);

  if (!projectId || (!fetching && files.length === 0)) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontFamily: "'Inter',sans-serif", color: "#909ab0",
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8,
      }}>
        {fetching ? "Loading project files…" : `Project files — click to include in generation`}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {files.map((f) => {
          const selected = selectedIds.includes(f.id);
          const busy = loadingIds.has(f.id);
          return (
            <div
              key={f.id}
              onClick={() => !busy && onToggle(f)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 20, cursor: busy ? "wait" : "pointer",
                fontSize: 12, transition: "all 0.15s",
                background: selected ? "rgba(240,165,0,0.08)" : "#fff",
                border: `1px solid ${selected ? "#f0a500" : "#e0e4ef"}`,
                color: selected ? "#c47f00" : "#606880",
              }}
            >
              <span>{f.file_type?.startsWith("image/") ? "🖼" : "📄"}</span>
              <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.file_name}
              </span>
              {busy && <span style={{ fontSize: 10, color: "#909ab0" }}>…</span>}
              {selected && !busy && <span style={{ color: "#f0a500", fontSize: 10 }}>✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Special Instructions textarea shared across all tools.
 */
export function SpecialInstructions({ value, onChange }) {
  return (
    <div className="input-group" style={{ marginTop: 8 }}>
      <label className="field-label">Special Instructions (optional)</label>
      <textarea
        placeholder="Any specific requirements, formatting preferences, or additional context for the AI…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ minHeight: 68 }}
      />
    </div>
  );
}
