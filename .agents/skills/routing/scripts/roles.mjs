// Who plays each role (#379): the kit's default from the routing skill's Roles table, or the person's own
// pick from [routing] in the profile, which wins. The project's docs/profile.toml first, then the home one.
//   node .agents/skills/routing/scripts/roles.mjs [cto|coordinator|builder] [--project <dir>]
// Prints one line per role, e.g. "cto: Claude Opus 5.5 · high (docs/profile.toml)". Warnings go to stderr.
// Dependency-free, Node 22+.
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The kit's defaults. They match the Roles table in the routing skill; a test checks. */
export const DEFAULTS = {
  cto: { model: "Claude Fable 5.2", effort: "high" },
  coordinator: { model: "Claude Opus 5.5", effort: "medium" },
  builder: { model: "Claude Sonnet 5.5", effort: "medium" },
};
const EFFORTS = ["low", "medium", "high", "extra-high"];

const HEADER = /^\s*\[\s*routing\s*\]\s*(?:#.*)?$/;
const PAIR = /^\s*(?:([A-Za-z0-9_-]+)|"([^"\\\n]*)"|'([^'\n]*)')\s*=\s*(.*)$/;
const ESCAPES = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };

// A TOML basic ("...") or literal ('...') string, then an optional comment; null for anything else.
function stringValue(raw) {
  const literal = /^'([^'\n]*)'\s*(?:#.*)?$/.exec(raw);
  if (literal) return literal[1];
  const basic = /^"((?:[^"\\\n]|\\.)*)"\s*(?:#.*)?$/.exec(raw);
  if (!basic) return null;
  let bad = false;
  const value = basic[1].replace(/\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (_, c) => {
    if (c.length > 1) {
      // TOML allows only Unicode scalar values: nothing above U+10FFFF, no surrogates.
      const point = parseInt(c.slice(1), 16);
      if (point <= 0x10ffff && (point < 0xd800 || point > 0xdfff)) return String.fromCodePoint(point);
    } else if (c in ESCAPES) return ESCAPES[c];
    bad = true;
    return "";
  });
  return bad ? null : value;
}

// A value with a control character would break the one-line-per-role output, so it can't be used.
const usable = (value) => (value === null || /[\u0000-\u001f\u007f]/.test(value) ? null : value);
const normalEffort = (value) => (value.toLowerCase() === "xhigh" ? "extra-high" : value.toLowerCase());

/**
 * A profile's [routing] table. keys: key -> its string, or null when the key is there but its value can't be read.
 * misplaced: routing was set before any table, as an inline table or a dotted key, which this reader skips.
 */
export function readRouting(toml) {
  const keys = new Map();
  let table = null;
  let misplaced = false;
  for (const line of toml.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) { table = HEADER.test(line) ? "routing" : "other"; continue; }
    if (table === null && /^\s*(?:routing|"routing"|'routing')\s*[.=]/.test(line)) misplaced = true;
    const pair = table === "routing" && PAIR.exec(line);
    if (!pair) continue;
    const key = pair[1] ?? pair[2] ?? pair[3];
    if (!keys.has(key)) keys.set(key, usable(stringValue(pair[4].trim())));
  }
  return { keys, misplaced };
}

/**
 * Each role's { model, effort, from }. profiles: [{ label, text }], the project's first; per key, the first
 * readable value wins. warn gets one line per key that is set but can't be used.
 */
export function resolveRoles(profiles, warn = () => {}) {
  const tables = profiles.map(({ label, text }) => {
    try {
      const { keys, misplaced } = readRouting(text);
      if (misplaced) warn(`roles.mjs: ${label} sets routing as an inline table or a dotted key; write it under [routing]. Skipped.`);
      return { label, keys };
    } catch (error) {
      warn(`roles.mjs: could not read ${label}: ${error.message}; using the next profile or the default.`);
      return { label, keys: new Map() };
    }
  });
  return Object.fromEntries(Object.entries(DEFAULTS).map(([role, fallback]) => {
    const notes = [];
    const pick = (key, valid = () => true) => {
      for (const { label, keys } of tables) {
        if (!keys.has(key)) continue;
        const value = keys.get(key)?.trim();
        if (value === "") continue;
        if (value !== undefined && valid(value)) return { value, from: label };
        warn(value === undefined
          ? `roles.mjs: could not read ${key} in ${label}: write it as ${key} = "..."; using the next profile or the default.`
          : `roles.mjs: ${key} = "${value}" in ${label} isn't low, medium, high or extra-high (xhigh); using the next profile or the default.`);
        notes.push(`could not read ${key} in ${label}`);
      }
      return null;
    };
    const model = pick(role);
    const effort = pick(`${role}_effort`, (v) => EFFORTS.includes(normalEffort(v)));
    const from = [...new Set([model?.from, effort?.from].filter(Boolean))].join(", ") || "default";
    return [role, {
      model: model?.value ?? fallback.model,
      effort: effort ? normalEffort(effort.value) : fallback.effort,
      from: [from, ...notes].join("; "),
    }];
  }));
}

// One profile's text, only from a plain file. Anything else (a folder, a FIFO, no access) gets one stderr line.
function readProfile(path, label) {
  try {
    if (!statSync(path).isFile()) throw new Error("not a plain file");
    return { label, text: readFileSync(path, "utf8") };
  } catch (error) {
    if (error.code !== "ENOENT") console.error(`roles.mjs: skipped ${label} (${path}): ${error.code ?? error.message}; using the next profile or the default.`);
    return null;
  }
}

// ~/.onrails, or ~/.ai-dev-workflow (its name before the rename to onRails) while only that one exists.
function homeProfile() {
  const fresh = join(homedir(), ".onrails"), old = join(homedir(), ".ai-dev-workflow");
  const dir = !existsSync(fresh) && existsSync(old) ? old : fresh;
  return [join(dir, "profile.toml"), `~/${basename(dir)}/profile.toml`];
}

function usage(message) {
  console.error(`${message} Usage: roles.mjs [${Object.keys(DEFAULTS).join("|")}] [--project <dir>]`);
  return 2;
}

function main(argv) {
  let project = ".";
  const roles = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") {
      if (i + 1 >= argv.length) return usage("--project needs a folder.");
      project = argv[++i];
    } else if (argv[i].startsWith("-")) return usage(`Unknown option "${argv[i]}".`);
    else roles.push(argv[i]);
  }
  if (roles.length > 1) return usage("One role at most.");
  const [role] = roles;
  if (role !== undefined && !Object.hasOwn(DEFAULTS, role)) return usage(`Unknown role "${role}". Roles: ${Object.keys(DEFAULTS).join(", ")}.`);
  const profiles = [[join(resolve(project), "docs", "profile.toml"), "docs/profile.toml"], homeProfile()]
    .map(([path, label]) => readProfile(path, label))
    .filter(Boolean);
  for (const [name, r] of Object.entries(resolveRoles(profiles, (line) => console.error(line)))) {
    if (!role || name === role) console.log(`${name}: ${r.model} · ${r.effort} (${r.from})`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    // Nothing a profile holds should end in a stack trace: one line, then a failing exit.
    console.error(`roles.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
