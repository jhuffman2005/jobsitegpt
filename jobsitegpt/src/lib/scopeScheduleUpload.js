// API call helpers for "upload an existing scope/schedule at project setup".
// Two paths per doc type:
//   USE AS-IS   → transcribe the document into the structured shape verbatim.
//   GENERATE    → run the existing ScopeGPT/ScheduleGPT generation prompt
//                 against the upload as source material.
//
// All calls go through callClaude (api/generate.js). PDF/DOCX/XLSX are sent
// as base64 document blocks; pasted text is sent as a plain text block.
// max_tokens is hardcoded in the proxy — do not pass it from here.

import { callClaude, toBase64 } from "./api";

const MEDIA_TYPE = {
  pdf:  "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const allowedExt = ["pdf", "docx", "xlsx"];

function extOf(file) {
  return (file.name.split(".").pop() || "").toLowerCase();
}

export function isAllowedUploadFile(file) {
  return allowedExt.includes(extOf(file));
}

// Build the Anthropic-format content array for a source (file or pasted text).
// One source per call — either a file OR text, not both.
async function buildSourceContent({ file, text }) {
  const content = [];
  if (file) {
    const ext = extOf(file);
    const mediaType = MEDIA_TYPE[ext];
    if (!mediaType) throw new Error(`Unsupported file type: .${ext}. Use PDF, DOCX, or XLSX.`);
    const b64 = await toBase64(file);
    content.push({
      type: "document",
      source: { type: "base64", media_type: mediaType, data: b64 },
    });
  } else if (text && text.trim()) {
    content.push({ type: "text", text: `Source document (pasted text):\n${text.trim()}` });
  } else {
    throw new Error("No source provided.");
  }
  return content;
}

// ── SCOPE: USE AS-IS (transcribe) ────────────────────────────────────────

const SCOPE_PARSE_SYSTEM =
  "You are transcribing an existing construction scope of work into structured format. Extract every trade and line item exactly as written, preserving the source's trade groupings. Do NOT add, infer, or expand content — transcribe only what is present. If the document is a flat list with no trade structure, group items under reasonable trade headings but still do not invent new line items. Extract general conditions, exclusions, and clarifications into their arrays. If a field cannot be determined, use an empty string or empty array. Return ONLY valid JSON — no preamble, no markdown code fences.";

const SCOPE_PARSE_SCHEMA =
  '{"scope_trades":[{"tradeName":"string","contractor":"string","scopeText":"string","lineItems":[{"description":"string","note":"string"}]}],"scope_notes":{"generalConditions":["string"],"exclusions":["string"],"clarifications":["string"]}}';

export async function parseScopeFromSource({ file, text }) {
  const content = await buildSourceContent({ file, text });
  content.push({
    type: "text",
    text: `Transcribe the construction scope of work from the source above into this exact JSON shape:\n${SCOPE_PARSE_SCHEMA}\n\nReturn ONLY valid JSON.`,
  });
  return await callClaude([{ role: "user", content }], SCOPE_PARSE_SYSTEM);
}

// ── SCOPE: GENERATE FROM THIS (reuse the existing ScopeGPT prompt) ───────

const SCOPE_GENERATE_SYSTEM =
  "You are an expert GC with 20+ years writing professional scopes of work. Be thorough and complete. Return valid JSON only, no markdown, no explanation, no preamble.";

// Mirrors the schema used in src/tools/ScopeGPT.jsx generate() so the output
// shape stays identical to a planset-driven generation.
const SCOPE_GENERATE_SCHEMA =
  '{"projectName":"string","projectType":"string","projectAddress":"string or null","overview":"string","trades":[{"id":1,"tradeName":"string","contractor":"string","scopeText":"string","lineItems":[{"description":"string","note":"string or null"}]}],"generalConditions":["string"],"exclusions":["string"],"clarifications":["string"],"estimatedDuration":"string","totalLineItemCount":0}';

export async function generateScopeFromSource({ file, text, projectContext = "" }) {
  const content = await buildSourceContent({ file, text });
  content.push({
    type: "text",
    text: `${projectContext ? `${projectContext}\n` : ""}Use the source above as the starting point and generate a complete professional scope of work. Return ONLY valid JSON:\n${SCOPE_GENERATE_SCHEMA}`,
  });
  return await callClaude([{ role: "user", content }], SCOPE_GENERATE_SYSTEM);
}

// ── SCHEDULE: USE AS-IS (transcribe) ─────────────────────────────────────

const SCHEDULE_PARSE_SYSTEM =
  "You are transcribing an existing construction schedule into structured format. Extract every task with its phase, start day (integer day offset), and duration in days, exactly as written. Do NOT add or infer tasks. Collect distinct phase names into schedule_phases. Populate schedule_subcontractors only if the source describes them. For dependencies, return an empty array — they will be set manually. If start day or duration cannot be determined, use 0 for startDay and 1 for durationDays. Return ONLY valid JSON — no preamble, no markdown code fences.";

const SCHEDULE_PARSE_SCHEMA =
  '{"schedule_tasks":[{"task":"string","phase":"string","trade":"string","startDay":0,"durationDays":1,"dependencies":[],"notes":"string"}],"schedule_phases":["string"],"schedule_subcontractors":[{"trade":"string","phase":"string","estimatedDays":0,"recommendedSubTypes":[],"scope":"string"}]}';

export async function parseScheduleFromSource({ file, text }) {
  const content = await buildSourceContent({ file, text });
  content.push({
    type: "text",
    text: `Transcribe the construction schedule from the source above into this exact JSON shape:\n${SCHEDULE_PARSE_SCHEMA}\n\nReturn ONLY valid JSON.`,
  });
  return await callClaude([{ role: "user", content }], SCHEDULE_PARSE_SYSTEM);
}

// ── SCHEDULE: GENERATE FROM THIS (reuse the existing ScheduleGPT prompt) ─

// Same schema and system prompt as ScheduleGPT's planset-driven generation.
const SCHEDULE_GENERATE_SCHEMA =
  '{"projectName":"string","totalDays":0,"phases":["Phase1"],"tasks":[{"id":1,"task":"string","phase":"string","startDay":1,"durationDays":5,"dependencies":[],"trade":"string","notes":"string"}],"subcontractors":[{"trade":"string","phase":"string","estimatedDays":0,"recommendedSubTypes":["string"],"scope":"string"}]}';

export async function generateScheduleFromSource({ file, text, projectContext = "", projectType = "remodel" }) {
  const system = `You are an expert construction scheduler. ${projectType === "remodel" ? "Focus on interior trades; only include exterior if documents explicitly call for them." : "Include full sequence: site work, excavation, foundation, framing, exterior, MEP, finishes."} Return valid JSON only, no markdown.`;
  const content = await buildSourceContent({ file, text });
  content.push({
    type: "text",
    text: `${projectContext ? `${projectContext}\n` : ""}Use the source above as the starting point. Analyze and return ONLY valid JSON:\n${SCHEDULE_GENERATE_SCHEMA}\n\nA full renovation: 15-30 tasks across multiple phases. Keep task names under 50 chars, notes under 60 chars, recommendedSubTypes 2-3 items max.`,
  });
  return await callClaude([{ role: "user", content }], system);
}
