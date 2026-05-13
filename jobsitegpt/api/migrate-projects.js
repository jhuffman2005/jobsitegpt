// One-time migration: promote each project's newest ScopeGPT/ScheduleGPT
// generation from project_generations.result_data into the new structured
// columns on projects (scope_trades, scope_notes, schedule_tasks,
// schedule_phases, schedule_subcontractors).
//
// Idempotent. A project whose scope_trades column is already populated is
// skipped for scope migration; same for schedule_tasks. Pass ?force=true
// (or POST body { force: true }) to re-run regardless.
//
// Auth: requires a Bearer JWT for the caller. We use the service role to
// verify the token and run the writes, but every query is scoped to the
// caller's user_id — there is no cross-user access.
//
// Returns a JSON summary the trigger page renders so the user can verify.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SCOPE_ORIGIN = "ai_generated";
const SCHEDULE_ORIGIN = "ai_generated";

function toNoteItem(text) {
  return {
    id: randomUUID(),
    text: typeof text === "string" ? text : String(text ?? ""),
    origin: SCOPE_ORIGIN,
    completed: false,
    completed_date: null,
    completed_by_log_id: null,
  };
}

function transformScope(legacy) {
  const trades = Array.isArray(legacy?.trades) ? legacy.trades : [];
  let lineItemCount = 0;

  const scope_trades = trades.map((t) => {
    const lineItems = Array.isArray(t?.lineItems) ? t.lineItems : [];
    lineItemCount += lineItems.length;
    return {
      id: randomUUID(),
      tradeName: t?.tradeName ?? "",
      contractor: t?.contractor ?? "",
      scopeText: t?.scopeText ?? "",
      origin: SCOPE_ORIGIN,
      lineItems: lineItems.map((li) => ({
        id: randomUUID(),
        description: li?.description ?? "",
        note: li?.note ?? null,
        origin: SCOPE_ORIGIN,
        completed: false,
        completed_date: null,
        completed_by_log_id: null,
      })),
    };
  });

  const noteArray = (arr) => (Array.isArray(arr) ? arr.map(toNoteItem) : []);
  const scope_notes = {
    generalConditions: noteArray(legacy?.generalConditions),
    exclusions: noteArray(legacy?.exclusions),
    clarifications: noteArray(legacy?.clarifications),
  };

  const noteCount =
    scope_notes.generalConditions.length +
    scope_notes.exclusions.length +
    scope_notes.clarifications.length;

  return {
    scope_trades,
    scope_notes,
    itemCount: lineItemCount + noteCount,
    tradeCount: scope_trades.length,
  };
}

function transformSchedule(legacy) {
  const tasks = Array.isArray(legacy?.tasks) ? legacy.tasks : [];

  // First pass: assign UUIDs and build the old-id -> new-id map so we can
  // remap dependencies in the second pass without losing edges.
  const idMap = new Map();
  const intermediate = tasks.map((t) => {
    const newId = randomUUID();
    if (t?.id !== undefined && t?.id !== null) {
      idMap.set(String(t.id), newId);
    }
    return { source: t, newId };
  });

  let approximated = 0;
  const schedule_tasks = intermediate.map(({ source, newId }) => {
    const startDay = Number(source?.startDay);
    const durationDays = Number(source?.durationDays);
    const hadStructured = Number.isFinite(startDay) && Number.isFinite(durationDays);
    if (!hadStructured) approximated++;
    const deps = Array.isArray(source?.dependencies) ? source.dependencies : [];
    return {
      id: newId,
      task: source?.task ?? "",
      phase: source?.phase ?? "",
      trade: source?.trade ?? "",
      notes: source?.notes ?? "",
      startDay: Number.isFinite(startDay) ? startDay : 1,
      durationDays: Number.isFinite(durationDays) ? durationDays : 1,
      dependencies: deps
        .map((d) => idMap.get(String(d)))
        .filter(Boolean),
      origin: SCHEDULE_ORIGIN,
      completed: false,
      completed_date: null,
      completed_by_log_id: null,
    };
  });

  const schedule_phases = Array.isArray(legacy?.phases) ? legacy.phases.map(String) : [];
  const schedule_subcontractors = Array.isArray(legacy?.subcontractors)
    ? legacy.subcontractors
    : [];

  return {
    schedule_tasks,
    schedule_phases,
    schedule_subcontractors,
    taskCount: schedule_tasks.length,
    approximated,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = req.headers.authorization || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const jwt = auth.slice(7);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Server is missing Supabase env vars" });
  }

  // Service-role client so we can write reliably; we manually scope every
  // query to the verified caller's user_id.
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: "Invalid token" });
  }
  const userId = userData.user.id;

  const force =
    req.query?.force === "true" ||
    req.query?.force === "1" ||
    req.body?.force === true;

  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, name, scope_trades, schedule_tasks")
    .eq("user_id", userId);
  if (projErr) {
    return res.status(500).json({ error: `projects fetch: ${projErr.message}` });
  }

  const summary = {
    user_id: userId,
    force,
    projects_total: projects?.length || 0,
    scope_migrated: 0,
    scope_skipped_already_done: 0,
    scope_skipped_no_generation: 0,
    schedule_migrated: 0,
    schedule_skipped_already_done: 0,
    schedule_skipped_no_generation: 0,
    scope_trades_migrated: 0,
    scope_items_migrated: 0,
    schedule_tasks_migrated: 0,
    schedule_tasks_approximated: 0,
    errors: [],
  };

  for (const project of projects || []) {
    // SCOPE
    try {
      if (project.scope_trades && !force) {
        summary.scope_skipped_already_done++;
        console.log(`[migrate] ${project.name}: scope already migrated, skipping`);
      } else {
        const { data: scopeGen, error: scopeGenErr } = await supabase
          .from("project_generations")
          .select("id, result_data, created_at")
          .eq("project_id", project.id)
          .eq("user_id", userId)
          .eq("tool", "ScopeGPT")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (scopeGenErr) throw new Error(`scope generation lookup: ${scopeGenErr.message}`);

        if (!scopeGen?.result_data) {
          summary.scope_skipped_no_generation++;
          console.log(`[migrate] ${project.name}: no ScopeGPT generations, skipping scope`);
        } else {
          const { scope_trades, scope_notes, itemCount, tradeCount } = transformScope(scopeGen.result_data);
          const { error: updErr } = await supabase
            .from("projects")
            .update({ scope_trades, scope_notes })
            .eq("id", project.id)
            .eq("user_id", userId);
          if (updErr) throw new Error(`scope update: ${updErr.message}`);
          summary.scope_migrated++;
          summary.scope_trades_migrated += tradeCount;
          summary.scope_items_migrated += itemCount;
          console.log(`[migrate] ${project.name}: scope -> ${tradeCount} trades, ${itemCount} items (from generation ${scopeGen.id})`);
        }
      }
    } catch (e) {
      summary.errors.push({ project_id: project.id, name: project.name, phase: "scope", error: e.message });
      console.error(`[migrate] ${project.name} scope error: ${e.message}`);
    }

    // SCHEDULE
    try {
      if (project.schedule_tasks && !force) {
        summary.schedule_skipped_already_done++;
        console.log(`[migrate] ${project.name}: schedule already migrated, skipping`);
      } else {
        const { data: schedGen, error: schedGenErr } = await supabase
          .from("project_generations")
          .select("id, result_data, created_at")
          .eq("project_id", project.id)
          .eq("user_id", userId)
          .eq("tool", "ScheduleGPT")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (schedGenErr) throw new Error(`schedule generation lookup: ${schedGenErr.message}`);

        if (!schedGen?.result_data) {
          summary.schedule_skipped_no_generation++;
          console.log(`[migrate] ${project.name}: no ScheduleGPT generations, skipping schedule`);
        } else {
          const { schedule_tasks, schedule_phases, schedule_subcontractors, taskCount, approximated } =
            transformSchedule(schedGen.result_data);
          const { error: updErr } = await supabase
            .from("projects")
            .update({ schedule_tasks, schedule_phases, schedule_subcontractors })
            .eq("id", project.id)
            .eq("user_id", userId);
          if (updErr) throw new Error(`schedule update: ${updErr.message}`);
          summary.schedule_migrated++;
          summary.schedule_tasks_migrated += taskCount;
          summary.schedule_tasks_approximated += approximated;
          console.log(`[migrate] ${project.name}: schedule -> ${taskCount} tasks${approximated ? ` (${approximated} approximated)` : ""} (from generation ${schedGen.id})`);
        }
      }
    } catch (e) {
      summary.errors.push({ project_id: project.id, name: project.name, phase: "schedule", error: e.message });
      console.error(`[migrate] ${project.name} schedule error: ${e.message}`);
    }
  }

  return res.status(200).json(summary);
}
