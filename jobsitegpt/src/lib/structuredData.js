// Shape transforms for the structured scope/schedule model.
//
// The codebase has two living shapes for both scope and schedule data:
//
//   LEGACY — what the AI returns and what we store in
//     `project_generations.result_data` and `bid_invitations.scope_snapshot`.
//     Trades and tasks carry numeric ids assigned by the model. Sibling note
//     lists (generalConditions/exclusions/clarifications) are arrays of plain
//     strings. No per-item completion tracking.
//
//   STRUCTURED — what we store on the active columns of `projects`
//     (scope_trades, scope_notes, schedule_tasks, etc.). Every trade, line
//     item, note, and task carries a UUID, an `origin` field, and the
//     completion triple (completed, completed_date, completed_by_log_id).
//     Schedule dependencies reference task UUIDs, not numeric ids.
//
// `project_generations` and `bid_invitations.scope_snapshot` STAY legacy
// forever — they are the stable historical/snapshot format. The structured
// shape only lives on `projects` active columns. Loaders normalize legacy
// shape into structured for editing; the corresponding savers denormalize
// back to legacy when writing to a historical row.
//
// All transforms are idempotent: passing an already-structured value to
// `ensureStructured*` returns it unchanged; passing already-legacy to
// `flattenStructured*` returns it unchanged.

const AI_ORIGIN = "ai_generated";

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }));

// ── Detection ─────────────────────────────────────────────────────────────

export function isStructuredScope(data) {
  if (!data || typeof data !== "object") return false;
  // The smoking gun is scope_trades + scope_notes at the top level. Legacy
  // shape has `trades` + sibling string arrays.
  return Array.isArray(data.scope_trades) && data.scope_notes && typeof data.scope_notes === "object";
}

export function isStructuredSchedule(data) {
  if (!data || typeof data !== "object") return false;
  return Array.isArray(data.schedule_tasks);
}

// ── Scope: legacy → structured ────────────────────────────────────────────

function toNoteItem(text, origin = AI_ORIGIN) {
  return {
    id: newId(),
    text: typeof text === "string" ? text : String(text ?? ""),
    origin,
    completed: false,
    completed_date: null,
    completed_by_log_id: null,
  };
}

function structureLegacyTrade(t) {
  const lineItems = Array.isArray(t?.lineItems) ? t.lineItems : [];
  return {
    id: newId(),
    tradeName: t?.tradeName ?? "",
    contractor: t?.contractor ?? "",
    scopeText: t?.scopeText ?? "",
    origin: AI_ORIGIN,
    lineItems: lineItems.map((li) => ({
      id: newId(),
      description: li?.description ?? "",
      note: li?.note ?? null,
      origin: AI_ORIGIN,
      completed: false,
      completed_date: null,
      completed_by_log_id: null,
    })),
  };
}

// Returns { scope_trades, scope_notes, meta } where meta carries the
// non-line-item top-level fields (projectName, overview, etc.) that the UI
// header reads. Those fields stay on the runtime object alongside the
// structured arrays; we only persist the arrays to the columns.
export function ensureStructuredScope(data) {
  if (!data) return null;
  if (isStructuredScope(data)) return data;

  const trades = Array.isArray(data.trades) ? data.trades : [];
  return {
    // Top-level metadata preserved verbatim (used by header / email / export)
    projectName: data.projectName ?? "",
    projectType: data.projectType ?? "",
    projectAddress: data.projectAddress ?? null,
    overview: data.overview ?? "",
    estimatedDuration: data.estimatedDuration ?? "",
    totalLineItemCount: data.totalLineItemCount ?? trades.reduce((n, t) => n + (t?.lineItems?.length || 0), 0),

    scope_trades: trades.map(structureLegacyTrade),
    scope_notes: {
      generalConditions: (data.generalConditions || []).map((x) => toNoteItem(x)),
      exclusions:        (data.exclusions || []).map((x) => toNoteItem(x)),
      clarifications:    (data.clarifications || []).map((x) => toNoteItem(x)),
    },
  };
}

// ── Scope: structured → legacy (for bid snapshots and history saves) ─────

function flattenTrade(t) {
  return {
    // Legacy trades had numeric ids derived from order. We don't try to fake
    // those; ScopeGPT's UI doesn't depend on the type. Bid snapshots store
    // exactly one trade so the id is moot. Keep tradeName/contractor/scopeText.
    id: t?.legacyId ?? 1,
    tradeName: t?.tradeName ?? "",
    contractor: t?.contractor ?? "",
    scopeText: t?.scopeText ?? "",
    lineItems: (t?.lineItems || []).map((li) => ({
      description: li?.description ?? "",
      note: li?.note ?? null,
    })),
  };
}

export function flattenStructuredScope(structured) {
  if (!structured) return null;
  if (!isStructuredScope(structured)) return structured; // already legacy

  const noteText = (arr) => (arr || []).map((n) => (typeof n === "string" ? n : (n?.text ?? "")));

  return {
    projectName: structured.projectName ?? "",
    projectType: structured.projectType ?? "",
    projectAddress: structured.projectAddress ?? null,
    overview: structured.overview ?? "",
    estimatedDuration: structured.estimatedDuration ?? "",
    totalLineItemCount: (structured.scope_trades || []).reduce((n, t) => n + (t?.lineItems?.length || 0), 0),
    trades: (structured.scope_trades || []).map((t, i) => ({ ...flattenTrade(t), id: i + 1 })),
    generalConditions: noteText(structured.scope_notes?.generalConditions),
    exclusions:        noteText(structured.scope_notes?.exclusions),
    clarifications:    noteText(structured.scope_notes?.clarifications),
  };
}

// Build a single-trade snapshot suitable for bid_invitations.scope_snapshot.
// The TradeBid page expects legacy shape — string note arrays, plain
// lineItems with { description, note }. structuredTrade may be a structured
// or legacy trade; we normalize and flatten in one shot.
export function buildLegacyTradeSnapshot(scopeStructured, structuredTrade) {
  const flatScope = flattenStructuredScope(scopeStructured);
  const flatTrade = isStructuredScope(scopeStructured)
    ? { ...flattenTrade(structuredTrade), id: 1 }
    : structuredTrade; // already legacy

  return {
    projectName: flatScope?.projectName,
    projectType: flatScope?.projectType,
    projectAddress: flatScope?.projectAddress ?? null,
    overview: flatScope?.overview,
    generalConditions: flatScope?.generalConditions || [],
    exclusions:        flatScope?.exclusions || [],
    clarifications:    flatScope?.clarifications || [],
    estimatedDuration: flatScope?.estimatedDuration,
    trades: [flatTrade],
  };
}

// ── Schedule: legacy → structured ─────────────────────────────────────────

export function ensureStructuredSchedule(data) {
  if (!data) return null;
  if (isStructuredSchedule(data)) return data;

  const legacyTasks = Array.isArray(data.tasks) ? data.tasks : [];

  // Two-pass: assign UUIDs and remap dependencies through an oldId → newUuid map.
  const idMap = new Map();
  const withIds = legacyTasks.map((t) => {
    const id = newId();
    if (t?.id !== undefined && t?.id !== null) idMap.set(String(t.id), id);
    return { source: t, id };
  });

  const schedule_tasks = withIds.map(({ source, id }) => {
    const startDay = Number(source?.startDay);
    const durationDays = Number(source?.durationDays);
    return {
      id,
      task: source?.task ?? "",
      phase: source?.phase ?? "",
      trade: source?.trade ?? "",
      notes: source?.notes ?? "",
      startDay: Number.isFinite(startDay) ? startDay : 1,
      durationDays: Number.isFinite(durationDays) ? durationDays : 1,
      dependencies: (Array.isArray(source?.dependencies) ? source.dependencies : [])
        .map((d) => idMap.get(String(d)))
        .filter(Boolean),
      origin: AI_ORIGIN,
      completed: false,
      completed_date: null,
      completed_by_log_id: null,
    };
  });

  return {
    projectName: data.projectName ?? "",
    totalDays: data.totalDays ?? 0,
    schedule_tasks,
    schedule_phases: Array.isArray(data.phases) ? data.phases.map(String) : [],
    schedule_subcontractors: Array.isArray(data.subcontractors) ? data.subcontractors : [],
  };
}

// ── Schedule: structured → legacy (for history saves) ────────────────────

export function flattenStructuredSchedule(structured) {
  if (!structured) return null;
  if (!isStructuredSchedule(structured)) return structured;

  // Build a uuid → ordinal map. Ordinal = 1-based index in the tasks array;
  // matches what the legacy AI shape used as `id` and what the UI shows.
  const ordinal = new Map();
  (structured.schedule_tasks || []).forEach((t, i) => ordinal.set(t.id, i + 1));

  const tasks = (structured.schedule_tasks || []).map((t, i) => ({
    id: i + 1,
    task: t.task ?? "",
    phase: t.phase ?? "",
    trade: t.trade ?? "",
    notes: t.notes ?? "",
    startDay: Number(t.startDay) || 1,
    durationDays: Number(t.durationDays) || 1,
    dependencies: (t.dependencies || []).map((d) => ordinal.get(d)).filter((n) => Number.isFinite(n)),
  }));

  return {
    projectName: structured.projectName ?? "",
    totalDays: structured.totalDays ?? 0,
    phases: structured.schedule_phases || [],
    tasks,
    subcontractors: structured.schedule_subcontractors || [],
  };
}

// ── Helpers for the dependencies UI (ordinal display, UUID storage) ──────

export function buildScheduleOrdinalMaps(tasks) {
  const idToOrdinal = new Map();
  const ordinalToId = new Map();
  (tasks || []).forEach((t, i) => {
    idToOrdinal.set(t.id, i + 1);
    ordinalToId.set(i + 1, t.id);
  });
  return { idToOrdinal, ordinalToId };
}

// ── Newly-added items (manual / upload origins) ───────────────────────────

export function makeBlankLineItem(origin = "user_added") {
  return {
    id: newId(),
    description: "",
    note: null,
    origin,
    completed: false,
    completed_date: null,
    completed_by_log_id: null,
  };
}

export function makeBlankNoteItem(origin = "user_added") {
  return toNoteItem("", origin);
}

export function makeBlankTask({ phase = "" } = {}, origin = "user_added") {
  return {
    id: newId(),
    task: "",
    phase,
    trade: "",
    notes: "",
    startDay: 1,
    durationDays: 1,
    dependencies: [],
    origin,
    completed: false,
    completed_date: null,
    completed_by_log_id: null,
  };
}

export function makeBlankTrade({ tradeName = "", contractor = "", scopeText = "" } = {}, origin = "user_added") {
  return {
    id: newId(),
    tradeName,
    contractor,
    scopeText,
    origin,
    lineItems: [],
  };
}

// CSS class for an item's origin badge. Three origins, three visual states:
//   ai_generated → no class (default rendering)
//   user_added   → blue left accent (.user-added)
//   uploaded     → green left accent (.uploaded)
export function originClassName(origin) {
  if (origin === "user_added") return "user-added";
  if (origin === "uploaded") return "uploaded";
  return "";
}

// ── Upload-parse output normalizers ───────────────────────────────────────
// The USE-AS-IS upload path asks the model for a hybrid shape: top-level
// `scope_trades` / `scope_notes` keys (new), but items inside lack UUIDs and
// completion fields and the note categories are plain string arrays. These
// helpers normalize that into the proper structured shape with UUIDs,
// completion fields, and a caller-provided origin (typically "uploaded").
//
// Distinct from ensureStructuredScope/Schedule, which:
//   - assume legacy shape OR already-fully-structured input
//   - hardcode origin to "ai_generated"
//   - are idempotent on truly-structured data (no re-UUID)

export function structureFromUploadScope(parsed, origin = "uploaded") {
  if (!parsed || typeof parsed !== "object") return null;

  const trades = (Array.isArray(parsed.scope_trades) ? parsed.scope_trades : []).map((t) => ({
    id: newId(),
    tradeName: t?.tradeName ?? "",
    contractor: t?.contractor ?? "",
    scopeText: t?.scopeText ?? "",
    origin,
    lineItems: (Array.isArray(t?.lineItems) ? t.lineItems : []).map((li) => ({
      id: newId(),
      description: li?.description ?? "",
      note: li?.note ?? null,
      origin,
      completed: false,
      completed_date: null,
      completed_by_log_id: null,
    })),
  }));

  const toNote = (text) => ({
    id: newId(),
    text: typeof text === "string" ? text : String(text ?? ""),
    origin,
    completed: false,
    completed_date: null,
    completed_by_log_id: null,
  });

  const notes = parsed.scope_notes || {};
  return {
    projectName: "",
    projectType: "",
    projectAddress: null,
    overview: "",
    estimatedDuration: "",
    totalLineItemCount: trades.reduce((n, t) => n + t.lineItems.length, 0),
    scope_trades: trades,
    scope_notes: {
      generalConditions: (Array.isArray(notes.generalConditions) ? notes.generalConditions : []).map(toNote),
      exclusions:        (Array.isArray(notes.exclusions)        ? notes.exclusions        : []).map(toNote),
      clarifications:    (Array.isArray(notes.clarifications)    ? notes.clarifications    : []).map(toNote),
    },
  };
}

export function structureFromUploadSchedule(parsed, origin = "uploaded") {
  if (!parsed || typeof parsed !== "object") return null;

  const tasks = (Array.isArray(parsed.schedule_tasks) ? parsed.schedule_tasks : []).map((t) => {
    const startDay = Number(t?.startDay);
    const durationDays = Number(t?.durationDays);
    return {
      id: newId(),
      task: t?.task ?? "",
      phase: t?.phase ?? "",
      trade: t?.trade ?? "",
      notes: t?.notes ?? "",
      startDay: Number.isFinite(startDay) ? startDay : 0,
      durationDays: Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 1,
      dependencies: [], // per spec: USE AS-IS leaves dependencies empty
      origin,
      completed: false,
      completed_date: null,
      completed_by_log_id: null,
    };
  });

  return {
    projectName: "",
    totalDays: tasks.reduce((m, t) => Math.max(m, (Number(t.startDay) || 0) + (Number(t.durationDays) || 0)), 0),
    schedule_tasks: tasks,
    schedule_phases: Array.isArray(parsed.schedule_phases) ? parsed.schedule_phases.map(String) : [],
    schedule_subcontractors: Array.isArray(parsed.schedule_subcontractors) ? parsed.schedule_subcontractors : [],
  };
}
