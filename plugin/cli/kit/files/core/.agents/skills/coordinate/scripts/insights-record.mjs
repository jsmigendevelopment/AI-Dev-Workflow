// The insights record format (#329, part of #281): one small JSON file per event in docs/insights/<yyyy-mm-dd>/.
// This is the master copy. scripts/sync-skills.mjs copies it to the coordinate skill (next to insights.mjs, the writer)
// and to cli/src, because skill scripts can't import each other. Plain Node 22, no dependencies.
// Format and kinds: .agents/skills/coordinate/references/insights.md.
import { randomBytes } from "node:crypto";

export const VERSION = 1;
export const TEXT_CAP = 200;
const SHA = /^[0-9a-f]{40}$/;
const RULE = /^(?:[^\s:]+:\d+|hook:[\w-]+|missing)$/;

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
  source: str(false, ["board"]),
};

/** Why a run's work went back (#380): too big, a must-fix finding, a red check, the machine, or a process rule. */
const SEND_BACKS =["size", "review-must", "checks", "infra", "process"];
/** The outcomes a send-back may come with: a run that passed or finished sent nothing back. */
const SENT_BACK = ["fail", "failed", "stopped", "handed-off"];

export const KINDS = {
  // usage_before and usage_after are the provider's reading as the tool shows it, or unknown; usage_from says where (#380).
  job: {
    outcome: str(true, OUTCOMES), started: str(false), ended: str(false),
    usage_before: str(false), usage_after: str(false), usage_from: str(false), send_back: str(false, SEND_BACKS),
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

function checkField(name, spec, value) {
  if (value === undefined) return spec.req ? `${name}: required` : null;
  if (value === null) return spec.nullable ? null : `${name}: can't be null`;
  if (spec.type === "int" && !(Number.isInteger(value) && value >= 0)) return `${name}: must be a whole number`;
  if (spec.type === "num" && !(typeof value === "number" && Number.isFinite(value) && value >= 0)) return `${name}: must be a number`;
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

function checkCommands(commands) {
  for (const c of commands) {
    if (!c || typeof c !== "object" || typeof c.name !== "string" || !["pass", "fail", "skipped"].includes(c.result)
      || !(typeof c.seconds === "number" && c.seconds >= 0)) {
      return "commands: each item needs name, result (pass, fail or skipped) and seconds";
    }
  }
  return null;
}

/** The run-cost rules of a job record (#380). Records from before #380 have none of these fields, so they pass. */
function jobProblems(record, board) {
  const errors = [];
  if (record.send_back !== undefined && record.outcome !== undefined && !SENT_BACK.includes(record.outcome)) {
    errors.push(`send_back: only on a run that sent work back (outcome ${SENT_BACK.join(", ")})`);
  }
  const reading = record.usage_before !== undefined || record.usage_after !== undefined;
  if (reading && !board && record.usage_from === undefined) {
    errors.push("usage_from: required with a usage reading (where it was read, or where you looked)");
  }
  return errors;
}

/** The problems with a record, each starting with the field's name. An empty list means it is valid. */
export function validate(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record: must be an object"];
  const errors = [];
  if (record.v !== VERSION) errors.push(`v: must be ${VERSION}`);
  // Own text keys only: "constructor" is no kind, and neither is ["review"], which Object.hasOwn reads as "review" (#332).
  const kinds = typeof record.kind === "string" && Object.hasOwn(KINDS, record.kind) ? KINDS[record.kind] : undefined;
  if (!kinds) return [...errors, `kind: must be one of ${Object.keys(KINDS).join(", ")}`];
  if (typeof record.at !== "string" || Number.isNaN(Date.parse(record.at)) || !record.at.endsWith("Z")) {
    errors.push("at: must be a UTC ISO time");
  }
  const board = record.source === "board";
  for (const [name, spec] of Object.entries(ENVELOPE)) {
    const e = checkField(name, spec, record[name]);
    if (e) errors.push(e);
  }
  for (const name of ["model", "effort"]) if (record[name] === undefined) errors.push(`${name}: required (unknown when not known)`);
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

export const LINE_START = "<!-- onrails-insights ";

/** The comment form of a record, for a session that commits nothing (a reviewer). */
export function toLine(record) {
  // "--" can't appear inside an HTML comment, so it is escaped in the JSON.
  return `${LINE_START}${JSON.stringify(record).replaceAll("--", "-\\u002d")} -->`;
}

/** The first valid record in a comment's text, or null. */
export function parseLine(text) {
  for (const m of String(text).matchAll(/<!-- onrails-insights (\{.*?\}) -->/g)) {
    try {
      const record = JSON.parse(m[1]);
      if (validate(record).length === 0) return record;
    } catch { /* not JSON: look at the next one */ }
  }
  return null;
}
