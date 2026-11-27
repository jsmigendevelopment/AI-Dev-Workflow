// npx onrails lesson check: refuse any kit lesson that isn't a closed record of known-safe values (#321).
// An allowlist, not a blocklist: every key, value and word must be on a fixed list. With the project's deny set (#322)
// it also refuses the project's own terms. It only reads, and an error
// names the field and the rule, never the refused text, so a refused record's private detail is never printed.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { loadKit } from "./kit.mjs";
import { denySet, projectTerm } from "./lesson-deny.mjs";
import { COMMON_WORDS, GLOSSARY } from "./lesson-words.mjs";

const ENUMS = {
  category: ["parallel-conflict", "gate", "waits-on-person", "sandbox", "flaky-test", "wrong-instruction",
    "missing-instruction", "cost", "other"],
  tool: ["claude-code", "codex", "unknown"],
  model_family: ["opus", "sonnet", "haiku", "fable", "gpt", "unknown"],
  automation: ["full", "recommended", "hands-on", "custom"],
};
const COST = { extra_runs: ["0", "1", "2-5", "6+"], hours_stuck: ["0", "<1", "1-4", "4+"] };
const KEYS = ["kit_version", "component", "category", "tool", "model_family", "automation", "cost", "lesson",
  "suggested_fix", "repo_key"];
// The free-text fields. Every other field must hold a value from a closed list.
const FREE_TEXT = ["lesson", "suggested_fix"];
const SENTENCE_MAX = 200;
const DETAIL = "[detail]";

// Each rule a sentence can break, checked in this order. The first match is the one reported.
const SENTENCE_RULES = [
  ["url", /:\/\/|\bwww\./i],
  ["path", /[/\\]/],
  ["email", /\S@\S/],
  ["mention", /@/],
  ["issue-number", /#/],
  ["digits", /\d{3}/],
  ["backtick", /`/],
  ["quote", /["'‘’“”]/],
  ["code", /[=(){}[\];<>]/],
];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Every file path the kit ships, templates under templates/<name>/.
function kitPaths(manifest) {
  const paths = Object.keys(manifest.core ?? {});
  for (const [name, files] of Object.entries(manifest.templates ?? {})) {
    paths.push(...Object.keys(files).map((p) => `templates/${name}/${p}`));
  }
  return paths;
}

// The skill folder a kit path sits in, or null.
function skillOf(path) {
  const parts = path.split("/");
  const at = parts.indexOf("skills");
  return at >= 0 && parts.length > at + 2 ? parts[at + 1] : null;
}

// The kit's skill names: the folders under skills/ in its manifest.
const skillNames = (manifest) => new Set(kitPaths(manifest).map(skillOf).filter(Boolean));

// The component names the kit ships: skill folders, script and hook names, and template names.
export function componentNames(manifest) {
  const names = new Set(["unknown", ...Object.keys(manifest.templates ?? {}), ...skillNames(manifest)]);
  for (const path of kitPaths(manifest)) {
    const parts = path.split("/");
    const file = parts.at(-1);
    if (file.endsWith(".mjs")) names.add(file.slice(0, -4));
    else if (parts.some((p) => /template/i.test(p))) names.add(file.replace(/\.[^.]+$/, "").toLowerCase());
  }
  return names;
}

function wordAllowed(word, components) {
  const known = (w) => GLOSSARY.has(w) || COMMON_WORDS.has(w) || components.has(w);
  return known(word) || word.split("-").every((part) => part && known(part));
}

// The rule a lesson or suggested fix breaks, or null.
export function sentenceRule(text, components) {
  if (typeof text !== "string" || !text.trim()) return "type";
  if (text.length > SENTENCE_MAX) return "length";
  for (const [rule, pattern] of SENTENCE_RULES) {
    if (pattern.test(text.replaceAll(DETAIL, ""))) return rule;
  }
  const body = text.trim().replace(/[.!?]$/, "");
  if (/[.!?]/.test(body.replaceAll(DETAIL, ""))) return "one-sentence";
  for (const raw of body.split(/\s+/)) {
    const token = raw.replace(/[,:]$/, "");
    if (token === DETAIL || /^\d{1,2}$/.test(token)) continue;
    if (!/^[a-z]+(-[a-z]+)*$/i.test(token)) return "code";
    if (!wordAllowed(token.toLowerCase(), components)) return "word";
  }
  return null;
}

// An extra key's name is never printed: the key itself could be the private detail.
const EXTRA = "(extra key)";

function checkCost(cost, errors) {
  if (!isObject(cost)) return errors.push({ field: "cost", rule: "type" });
  for (const key of Object.keys(cost)) {
    if (!(key in COST)) errors.push({ field: `cost.${EXTRA}`, rule: "extra-key" });
  }
  for (const [key, allowed] of Object.entries(COST)) {
    if (!(key in cost)) errors.push({ field: `cost.${key}`, rule: "missing" });
    else if (!allowed.includes(cost[key])) errors.push({ field: `cost.${key}`, rule: "not-allowed" });
  }
}

// Every string field, with the name an error prints for it. An extra key's name stays hidden.
function stringFields(record) {
  const fields = [];
  for (const [key, value] of Object.entries(record)) {
    const field = KEYS.includes(key) ? key : EXTRA;
    if (typeof value === "string") fields.push([field, value]);
    else if (key === "cost" && isObject(value)) {
      for (const [sub, inner] of Object.entries(value)) {
        if (typeof inner === "string") fields.push([`cost.${sub in COST ? sub : EXTRA}`, inner]);
      }
    }
  }
  return fields;
}

// A project term in a free-text field (#322), named by its field and source kind, never by the term. A field that
// passed its closed list is skipped: its value is the kit's own (`claude-code`, a component such as `board`), so it
// carries nothing from the project even when the project's docs or name use the same word.
function checkDeny(record, deny, errors) {
  const refused = new Set(errors.map((e) => e.field));
  const seen = new Set();
  for (const [field, value] of stringFields(record)) {
    if (!FREE_TEXT.includes(field) && !refused.has(field)) continue;
    const kind = projectTerm(value, deny);
    if (!kind || seen.has(field)) continue;
    seen.add(field);
    errors.push({ field, rule: `contains a project term (${kind})` });
  }
}

// { ok, errors: [{ field, rule }] }. Never alters the record. `deny` is the project's deny set (#322), if any.
export function checkLesson(record, { manifest, deny }) {
  if (!isObject(record)) return { ok: false, errors: [{ field: "record", rule: "type" }] };
  const errors = [];
  for (const key of Object.keys(record)) {
    if (!KEYS.includes(key)) errors.push({ field: EXTRA, rule: "extra-key" });
  }
  const components = componentNames(manifest);
  for (const key of KEYS) {
    const value = record[key];
    if (!Object.hasOwn(record, key)) { errors.push({ field: key, rule: "missing" }); continue; }
    if (key === "cost") { checkCost(value, errors); continue; }
    let rule = null;
    if (key === "lesson" || key === "suggested_fix") rule = sentenceRule(value, components);
    else if (typeof value !== "string") rule = "type";
    else if (key === "kit_version") rule = /^\d+\.\d+\.\d+$/.test(value) ? null : "not-allowed";
    else if (key === "repo_key") rule = /^[0-9a-f]{64}$/.test(value) ? null : "not-allowed";
    else if (key === "component") rule = components.has(value) ? null : "not-allowed";
    else rule = ENUMS[key].includes(value) ? null : "not-allowed";
    if (rule) errors.push({ field: key, rule });
  }
  if (deny) checkDeny(record, deny, errors);
  return { ok: errors.length === 0, errors };
}

const USAGE = "Usage: npx onrails lesson check <file> [--project <dir>]";
const usage = (message) => (console.error(`${message}\n${USAGE}`), 2);

/** `lesson check <file> [--project <dir>]`, from the CLI's arguments after `lesson`. */
export function lesson(argv, options) {
  const [sub, ...rest] = argv;
  if (sub !== "check") return usage(`Unknown lesson command: ${sub ?? ""} (use check)`);
  const files = [];
  let dir;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--project") dir = rest[++i] ?? "";
    else if (arg.startsWith("--project=")) dir = arg.slice("--project=".length);
    else if (arg.startsWith("-")) return usage(`Unknown option: ${arg}`);
    else files.push(arg);
  }
  if (files.length > 1) return usage("Name one lesson file.");
  return lessonCheck(files[0], dir, options);
}

// The CLI command. 0 accepted, 1 refused, 2 bad usage. dir is the project whose own terms are refused (#322): the
// current repo by default.
export function lessonCheck(file, dir, { kitDir, home } = {}) {
  if (!file) return usage("Name the lesson file.");
  if (dir !== undefined && !isDir(dir)) return usage("The project to check against isn't a folder.");
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return usage("Can't read the lesson file."); }
  let record;
  try { record = JSON.parse(text); } catch { return refuse([{ field: "record", rule: "not-json" }]); }
  const manifest = readManifest(kitDir);
  // Only glossary words and skill names leave the deny set (decision 322-1): an app named after a kit file such as
  // board or vision is still the app's name.
  const kitWords = new Set([...GLOSSARY, ...skillNames(manifest)]);
  const deny = denySet(dir ?? currentRepo(), { home, kitWords, kitFiles: manifest.core ?? {} });
  const { ok, errors } = checkLesson(record, { manifest, deny });
  if (!ok) return refuse(errors);
  console.log("Lesson accepted.");
  return 0;
}

// The top of the git repo this runs in, else the current folder.
function currentRepo() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Not in a git repo: the current folder's own files still count.
    return process.cwd();
  }
}

function refuse(errors) {
  console.error("Lesson refused:");
  for (const { field, rule } of errors) console.error(`  ${field}: ${rule}`);
  return 1;
}

function isDir(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

// The CLI's own bundled kit, so a project can't widen the component list.
function readManifest(kitDir) {
  const kit = loadKit(kitDir);
  return { core: kit.core, templates: kit.templates };
}
