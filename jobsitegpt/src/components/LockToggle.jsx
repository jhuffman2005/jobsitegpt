// Lock toggle pill for ScopeGPT / ScheduleGPT.
// Click sets the column directly; the parent supplies the toggle handler
// (which is responsible for the unlock-confirm dialog).
//
// Visual: open padlock + "Unlocked — generations will overwrite" or
//         closed padlock + "Locked — source of truth".
//
// Prominent enough to notice (subtle border + emoji icon), not so loud
// it dominates the view — sits in the same row as ProjectSwitcher.

export default function LockToggle({ locked, onToggle, disabled = false }) {
  return (
    <button
      type="button"
      className={`lock-toggle${locked ? " locked" : ""}`}
      onClick={onToggle}
      disabled={disabled}
      title={locked ? "Click to unlock" : "Click to lock"}
    >
      <span className="lock-icon" aria-hidden>{locked ? "🔒" : "🔓"}</span>
      <span className="lock-label">
        {locked ? "Locked — source of truth" : "Unlocked — generations will overwrite"}
      </span>
    </button>
  );
}
