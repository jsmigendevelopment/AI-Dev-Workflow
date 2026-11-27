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
const list = (req = true) => ({ type: "list", req });

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

export const KINDS = {
  job: { outcome: str(true, OUTCOMES), started: str(false), ended: str(false) },
  check: { commands: list(), failed_step: str(false), flaky_rerun: bool(false) },
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
  return name in ENVELOPE ? ENVELOPE[name] : KINDS[kind]?.[name];
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

/** The problems with a record, each starting with the field's name. An empty list means it is valid. */
export function validate(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record: must be an object"];
  const errors = [];
  if (record.v !== VERSION) errors.push(`v: must be ${VERSION}`);
  const kinds = KINDS[record.kind];
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
    if (!["v", "kind", "at"].includes(name) && !(name in ENVELOPE) && !(name in kinds)) errors.push(`${name}: not a field of ${record.kind}`);
  }
  if (record.kind === "check" && Array.isArray(record.commands)) {
    const e = checkCommands(record.commands);
    if (e) errors.push(e);
  }
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
