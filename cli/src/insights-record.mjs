// The insights record format (#329, part of #281): one small JSON file per event in docs/insights/<yyyy-mm-dd>/.
// This is the master copy. scripts/sync-skills.mjs copies it to the coordinate skill (next to insights.mjs, the writer)
// and to cli/src, because skill scripts can't import each other. Plain Node 22, no dependencies.
// Format and kinds: .agents/skills/coordinate/references/insights.md.
import { randomBytes } from "node:crypto";

export const VERSION = 1;
export const TEXT_CAP = 200;
/** At this many counted lines or more, a pull request fails the size check (pr-size.mjs's MAX_CHANGED_LINES, #427). */
export const SIZE_LIMIT = 1000;
const SHA = /^[0-9a-f]{40}$/;
// A rule's path holds no space, colon or control character (#334): records name it as people read it.
const RULE = /^(?:[^\s:\u0000-\u001f\u007f]+:\d+|hook:[\w-]+|missing)$/;
/** An ask record's file name (#334): what an answer record's answered names. */
export const ASK_FILE = /^\d{4}-ask-\d+-[0-9a-f]{6}\.json$/;

// A field spec: type (int, num, str, bool, list, json), required, and for str an optional list of values or a pattern.
const int = (req = true) => ({ type: "int", req });
const num = (req = true) => ({ type: "num", req });
const str = (req = true, values) => ({ type: "str", req, values });
const bool = (req = true) => ({ type: "bool", req });
// A list holds text items, except check's commands, whose objects checkCommands checks.
const list = (req = true, items = "text") => ({ type: "list", req, items });

export const OUTCOMES = ["started", "pr-opened", "finished", "handed-off", "stopped", "failed", "swept", "paused", "ended", "pass", "fail"];

export const ENVELOPE = {
  issue: { type: "int", req: false, nullable: true },
  pr: { type: "int", req: false, nullable: true },
  sha: { type: "str", req: false, nullable: true, pattern: SHA, hint: "40 lowercase hex characters" },
  job: { type: "str", req: false, nullable: true },
  tool: { type: "str", req: false, nullable: true },
  model: str(false),
  effort: str(false),
  // Where model and effort were read, or why one is unknown (#129).
  model_from: str(false),
  source: str(false, ["board"]),
};

/** A usage reading's window as the tool names it (#431): `seven_day`, `five_hour`, or `unknown`. */
const WINDOW = { type: "str", req: false, pattern: /^[a-z][a-z0-9_]{0,39}$/, hint: "a window name as the tool shows it, lower case letters, digits and underscores (seven_day), or unknown" };

/** Why a run's work went back (#380): too big, a must-fix finding, a red check, the machine, or a process rule. */
const SEND_BACKS = ["size", "review-must", "checks", "infra", "process"];
/** The outcomes a send-back may come with: a run that passed or finished sent nothing back. */
const SENT_BACK = ["fail", "failed", "stopped", "handed-off"];

export const KINDS = {
  // usage_before and usage_after are the provider's reading as the tool shows it, or unknown; usage_from says where (#380).
  // lines is a size-check record's counted lines of the head it checked (#427). usage_window_* and usage_resets_* are the
  // window a reading is for (seven_day) and the UTC time it resets, as the tool shows them, or unknown (#431).
  job: {
    outcome: str(true, OUTCOMES), started: str(false), ended: str(false),
    usage_before: str(false), usage_after: str(false), usage_from: str(false), send_back: str(false, SEND_BACKS), lines: int(false),
    usage_window_before: WINDOW, usage_window_after: WINDOW, usage_resets_before: str(false), usage_resets_after: str(false),
  },
  // state, fence and a null failed_step come from the local gate's mark-check.mjs --record (#331, decision 331-1).
  check: {
    commands: list(true, "object"), failed_step: { type: "str", req: false, nullable: true }, flaky_rerun: bool(false),
    state: str(false, ["success", "failure"]), fence: str(false),
  },
  review: { round: int(), verdict: str(true, ["pass", "changes"]), must: int(), nice: int(), categories: list(false) },
  "fix-round": { round: int(), fixed: int() },
  ask: {
    rule: { type: "str", req: true, pattern: RULE, hint: "<path>:<line>, hook:<event> or missing" },
    level: str(true, ["blocker", "decision", "fyi"]), waited_minutes: num(false), full_should_prevent: bool(false),
    rule_ok: bool(false), title: str(false),
    answered: { type: "str", req: false, pattern: ASK_FILE, hint: "an ask record's file name, <hhmm>-ask-<n>-<id>.json" },
  },
  touch: { what: str(true, ["sign-in", "merge", "yes", "paste", "answer", "other"]), minutes: num() },
  merge: { conflicted: list() },
  rollback: { why: str(), place: str(true, ["test", "production"]) },
  block: { check: str(), rung: str() },
  usage: { limit: str(), waited_minutes: num() },
  gate: { pass: str(), issues_done: int(), hours_to_ready: num() },
  note: {
    kind_of: str(true, ["went-right", "went-wrong", "look-again"]), belongs: str(true, ["project", "kit", "tool"]),
    text: str(), links: list(false),
  },
};

/** The spec of one field of a kind, or undefined. */
export function fieldSpec(kind, name) {
  // Only text names a kind or field: Object.hasOwn would turn ["review"] into "review" (#332).
  if (typeof name !== "string") return undefined;
  if (Object.hasOwn(ENVELOPE, name)) return ENVELOPE[name];
  return typeof kind === "string" && Object.hasOwn(KINDS, kind) && Object.hasOwn(KINDS[kind], name) ? KINDS[kind][name] : undefined;
}

/** Turns a key=value string from the command line into the field's type. Throws a message that names the field. */
export function coerce(kind, name, raw) {
  const spec = fieldSpec(kind, name);
  if (!spec) throw new Error(`${name}: not a field of ${kind}`);
  if (spec.nullable && raw === "null") return null;
  if (spec.type === "int" || spec.type === "num") {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) throw new Error(`${name}: "${raw}" isn't a number`);
    return n;
  }
  if (spec.type === "bool") {
    if (raw !== "true" && raw !== "false") throw new Error(`${name}: must be true or false`);
    return raw === "true";
  }
  if (spec.type === "list") {
    if (raw.trim().startsWith("[")) {
      try { return JSON.parse(raw); } catch { throw new Error(`${name}: isn't a JSON list`); }
    }
    return raw === "" ? [] : raw.split(",");
  }
  return raw;
}

/** A num value: fractions stay (a check's 95.5 seconds), but never past the safe integer range (#411). */
const safeNumber = (value) => typeof value === "number" && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

function checkField(name, spec, value) {
  if (value === undefined) return spec.req ? `${name}: required` : null;
  if (value === null) return spec.nullable ? null : `${name}: can't be null`;
  if (spec.type === "int" && !(Number.isSafeInteger(value) && value >= 0)) return `${name}: must be a whole number up to ${Number.MAX_SAFE_INTEGER}`;
  if (spec.type === "num" && !safeNumber(value)) return `${name}: must be a number from 0 to ${Number.MAX_SAFE_INTEGER}`;
  if (spec.type === "bool" && typeof value !== "boolean") return `${name}: must be true or false`;
  if (spec.type === "list" && !Array.isArray(value)) return `${name}: must be a list`;
  if (spec.type === "str") {
    if (typeof value !== "string" || value === "") return `${name}: must be text`;
    if (value.length > TEXT_CAP) return `${name}: longer than ${TEXT_CAP} characters`;
    if (spec.values && !spec.values.includes(value)) return `${name}: must be one of ${spec.values.join(", ")}`;
    if (spec.pattern && !spec.pattern.test(value)) return `${name}: must be ${spec.hint}`;
  }
  if (spec.type === "list" && spec.items === "text" && value.some((v) => typeof v !== "string")) return `${name}: each item must be text`;
  if (spec.type === "list" && value.some((v) => typeof v === "string" && v.length > TEXT_CAP)) {
    return `${name}: an item is longer than ${TEXT_CAP} characters`;
  }
  return null;
}

/** The only keys a commands item has: any other, an own __proto__ included, is refused (#411). */
const COMMAND_KEYS = ["name", "result", "seconds"];

function checkCommands(commands) {
  for (const c of commands) {
    if (!c || typeof c !== "object" || typeof c.name !== "string" || !["pass", "fail", "skipped"].includes(c.result)
      || !safeNumber(c.seconds)) {
      return "commands: each item needs name, result (pass, fail or skipped) and seconds";
    }
    if (Object.keys(c).some((k) => !COMMAND_KEYS.includes(k))) return `commands: an item has a key other than ${COMMAND_KEYS.join(", ")}`;
    if (c.name.length > TEXT_CAP) return `commands: a name is longer than ${TEXT_CAP} characters`;
  }
  return null;
}

/** Exactly what toISOString writes for it: Date.parse alone reads "(...)" as a comment and takes offsets (#411). */
const isoUtc = (at) => typeof at === "string" && !Number.isNaN(Date.parse(at)) && new Date(at).toISOString() === at;

/**
 * The window and reset rules (#431): each belongs to a reading, and a reset time is a UTC time exactly as toISOString
 * writes it, or unknown. A tool may show the window and reset with no percentage, so the reading may be unknown.
 */
function windowProblems(record) {
  const errors = [];
  for (const side of ["before", "after"]) {
    for (const name of [`usage_window_${side}`, `usage_resets_${side}`]) {
      const value = record[name];
      if (value === undefined) continue;
      if (record[`usage_${side}`] === undefined) errors.push(`${name}: only with usage_${side} (the reading it is for)`);
      if (name.startsWith("usage_resets_") && typeof value === "string" && value !== "" && value !== "unknown" && !isoUtc(value)) {
        errors.push(`${name}: must be a UTC ISO time, exactly as toISOString writes it (2026-11-30T10:00:00.000Z), or unknown`);
      }
    }
  }
  return errors;
}

/** The run-cost rules of a job record (#380). Records from before #380 have none of these fields, so they pass. */
function jobProblems(record, board) {
  const errors = windowProblems(record);
  if (record.send_back !== undefined && !SENT_BACK.includes(record.outcome)) {
    errors.push(`send_back: only on a run that sent work back (outcome ${SENT_BACK.join(", ")})`);
  }
  const reading = record.usage_before !== undefined || record.usage_after !== undefined;
  if (reading && !board && record.usage_from === undefined) {
    errors.push("usage_from: required with a usage reading (where it was read, or where you looked)");
  }
  return errors;
}

/**
 * The size-check rules of a record with lines (#427): the count belongs to one head, of a size check that passed or
 * failed, and a failed one is the size send-back, which pr-size.mjs gives only at the limit or over it.
 */
function sizeProblems(record) {
  const errors = [];
  if (record.job !== "size-check") errors.push("lines: only on a size-check job record");
  else if (!["pass", "fail"].includes(record.outcome)) errors.push("lines: only with outcome pass or fail");
  if (typeof record.sha !== "string") errors.push("sha: required with lines (the head that was counted)");
  if (record.outcome === "fail" && record.job === "size-check") {
    if (Number.isSafeInteger(record.lines) && record.lines < SIZE_LIMIT) errors.push(`lines: a failed size check counted ${SIZE_LIMIT} or more, not ${record.lines}`);
    if (record.send_back !== "size") errors.push("send_back: a failed size check with lines is send_back=size");
  }
  return errors;
}

/** An ask's title is shown to people, and an answer always says how long it waited (#334). */
function askProblems(record) {
  const errors = [];
  if (typeof record.title === "string" && CONTROL.test(record.title)) errors.push("title: holds a control character (U+0000 to U+001F or U+007F)");
  if (record.answered !== undefined && record.waited_minutes === undefined) errors.push("waited_minutes: required with answered");
  return errors;
}

/** The fields the run line prints (#129). A control character there, a newline above all, could fake a second run line. */
const PRINTED = ["job", "model", "effort", "model_from"];
const CONTROL = /[\u0000-\u001f\u007f]/;

/** The problems with a record, each starting with the field's name. An empty list means it is valid. */
export function validate(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record: must be an object"];
  const errors = [];
  if (record.v !== VERSION) errors.push(`v: must be ${VERSION}`);
  // Own text keys only: "constructor" is no kind, and neither is ["review"], which Object.hasOwn reads as "review" (#332).
  const kinds = typeof record.kind === "string" && Object.hasOwn(KINDS, record.kind) ? KINDS[record.kind] : undefined;
  if (!kinds) return [...errors, `kind: must be one of ${Object.keys(KINDS).join(", ")}`];
  if (!isoUtc(record.at)) errors.push("at: must be a UTC ISO time, exactly as toISOString writes it (2026-11-27T14:32:00.000Z)");
  const board = record.source === "board";
  for (const [name, spec] of Object.entries(ENVELOPE)) {
    const e = checkField(name, spec, record[name]);
    if (e) errors.push(e);
  }
  for (const name of ["model", "effort"]) if (record[name] === undefined) errors.push(`${name}: required (unknown when not known)`);
  for (const name of PRINTED) {
    if (typeof record[name] === "string" && CONTROL.test(record[name])) errors.push(`${name}: holds a control character (U+0000 to U+001F or U+007F)`);
  }
  for (const [name, spec] of Object.entries(kinds)) {
    const e = checkField(name, board ? { ...spec, req: false } : spec, record[name]);
    if (e) errors.push(e);
  }
  for (const name of Object.keys(record)) {
    if (!["v", "kind", "at"].includes(name) && !Object.hasOwn(ENVELOPE, name) && !Object.hasOwn(kinds, name)) errors.push(`${name}: not a field of ${record.kind}`);
  }
  if (record.kind === "check" && Array.isArray(record.commands)) {
    const e = checkCommands(record.commands);
    if (e) errors.push(e);
  }
  if (record.kind === "job") errors.push(...jobProblems(record, board));
  if (record.kind === "job" && record.lines !== undefined) errors.push(...sizeProblems(record));
  if (record.kind === "ask") errors.push(...askProblems(record));
  if (record.kind === "note" && !board && record.kind_of !== "went-right" && !(Array.isArray(record.links) && record.links.length)) {
    errors.push("links: required unless kind_of is went-right");
  }
  return errors;
}

/** <hhmm>-<kind>-<n>-<id>.json: n is the PR, else the issue, else 0; id is 6 random hex characters (decision 329-1). */
export function fileName(record, id = randomBytes(3).toString("hex")) {
  const at = new Date(record.at);
  const hhmm = String(at.getUTCHours()).padStart(2, "0") + String(at.getUTCMinutes()).padStart(2, "0");
  return `${hhmm}-${record.kind}-${record.pr ?? record.issue ?? 0}-${id}.json`;
}

/** The folder a record goes in, relative to the repo root: docs/insights/<UTC yyyy-mm-dd>. */
export function dayFolder(record) {
  return `docs/insights/${new Date(record.at).toISOString().slice(0, 10)}`;
}

/** A run's start or end as a UTC time, to the minute or finer. Anything else gives no duration (#129). */
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/;
const stamp = (text) => (typeof text === "string" && STAMP.test(text) ? Date.parse(text) : Number.NaN);

/** Whole minutes from a job record's started to its ended, else to its at. Null when either isn't a UTC time, or it runs backwards. */
export function minutes(record) {
  const ms = stamp(record.ended ?? record.at) - stamp(record.started);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : null;
}

/** Minutes as people read them: "6 min", "1 h 25 min", or unknown for null. */
export function timeText(mins) {
  if (mins === null) return "unknown";
  if (mins < 1) return "under 1 min";
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
}

function target(record) {
  const at = record.sha ? ` @ ${record.sha.slice(0, 7)}` : "";
  if (record.pr != null) return `#${record.pr}${at}`;
  return record.issue != null ? `issue #${record.issue}${at}` : record.sha ? record.sha.slice(0, 7) : "no target";
}

/**
 * A job record as one line people read (#129): job · model · effort · time [· outcome] · target, then why, when the
 * model or effort is unknown and the record says. `mins` defaults to minutes(record); a start record has no time yet.
 */
export function runLine(record, { mins = minutes(record), outcome = false } = {}) {
  const parts = [record.job ?? "unknown", record.model, record.effort, record.outcome === "started" ? "-" : timeText(mins)];
  if (outcome) parts.push(record.outcome ?? "unknown");
  parts.push(target(record));
  if ((record.model === "unknown" || record.effort === "unknown") && record.model_from) parts.push(`unknown: ${record.model_from}`);
  return parts.join(" · ");
}

export const LINE_START = "<!-- onrails-insights ";
/**
 * The comment form on one line. [^\r\n] and not ".": a dot stops at U+2028 and U+2029, which JSON.stringify leaves as
 * they are, so a valid line holding one would be skipped without a word (#424).
 */
export const LINE_BODY = /<!-- onrails-insights (\{[^\r\n]*?\}) -->/g;

/** The comment form of a record, for a session that commits nothing (a reviewer). */
export function toLine(record) {
  // "--" can't appear inside an HTML comment, so it is escaped in the JSON.
  return `${LINE_START}${JSON.stringify(record).replaceAll("--", "-\\u002d")} -->`;
}

/** The first valid record in a comment's text, or null. */
export function parseLine(text) {
  for (const m of String(text).matchAll(LINE_BODY)) {
    try {
      const record = JSON.parse(m[1]);
      if (validate(record).length === 0) return record;
    } catch { /* not JSON: look at the next one */ }
  }
  return null;
}
