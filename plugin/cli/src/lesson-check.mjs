// npx onrails lesson check: refuse any kit lesson that isn't a closed record of known-safe values (#321).
// An allowlist, not a blocklist: every key, value and word must be on a fixed list. It only reads, and an error
// names the field and the rule, never the refused text, so a refused record's private detail is never printed.
import { readFileSync, statSync } from "node:fs";
import { loadKit } from "./kit.mjs";
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

// The component names the kit ships: skill folders, script and hook names, and template names.
export function componentNames(manifest) {
  const names = new Set(["unknown"]);
  const paths = [...Object.keys(manifest.core ?? {})];
  for (const [name, files] of Object.entries(manifest.templates ?? {})) {
    names.add(name);
    paths.push(...Object.keys(files).map((p) => `templates/${name}/${p}`));
  }
  for (const path of paths) {
    const parts = path.split("/");
    const skill = parts.indexOf("skills");
    if (skill >= 0 && parts.length > skill + 2) names.add(parts[skill + 1]);
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

// { ok, errors: [{ field, rule }] }. Never alters the record.
export function checkLesson(record, { manifest }) {
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
  return { ok: errors.length === 0, errors };
}

// The CLI command. 0 accepted, 1 refused, 2 bad usage. [dir] is the project folder, for its deny set (#322).
export function lessonCheck(file, dir, { kitDir } = {}) {
  const usage = (message) => (console.error(`${message}\nUsage: npx onrails lesson check <file> [dir]`), 2);
  if (!file) return usage("Name the lesson file.");
  if (dir !== undefined && !isDir(dir)) return usage("The folder to check against isn't a folder.");
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return usage("Can't read the lesson file."); }
  let record;
  try { record = JSON.parse(text); } catch { return refuse([{ field: "record", rule: "not-json" }]); }
  const { ok, errors } = checkLesson(record, { manifest: readManifest(kitDir) });
  if (!ok) return refuse(errors);
  console.log("Lesson accepted.");
  return 0;
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
