import { useState, useRef } from "react";

export function ProcessingSteps({ steps, idx }) {
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
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 14, color: "var(--muted, #6b7599)" }}>
          Drop files or click to upload
        </div>
        <div style={{ fontSize: 11, color: "#3a4260", fontFamily: "'IBM Plex Mono', monospace", marginTop: 5 }}>
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
