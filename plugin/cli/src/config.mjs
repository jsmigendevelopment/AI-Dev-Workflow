// config get <section.key> [dir]: the value a setting resolves to and the layer it came from (#708, step 1 of #124).
// Layers, first match wins: the project's docs/profile.toml, then your ~/.onrails/profile.toml, then the kit's profile
// template. Reads `key = value` lines in a [section]: "strings", true/false and whole numbers, the shapes the template
// uses. Arrays, inline tables and tables inside tables are not read. A blank value counts as not set, as latest.mjs reads it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { toNative } from "./files.mjs";
import { loadKit } from "./kit.mjs";
import { TEMPLATE, profilePath } from "./profile.mjs";

const NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
// Words that mark a name as a credential. "auth" and "monkey" are not on it: a name counts only when a whole word matches.
const SECRET_WORDS = new Set(["token", "secret", "password", "passwd", "passphrase", "key", "apikey", "credential", "credentials", "bearer"]);

/** True when a word of the section or key name (split at _ - and a lower-to-upper change) says it holds a credential. */
export function looksSecret(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[._-]+/).some((word) => SECRET_WORDS.has(word));
}

// What follows a value on its line: nothing, or a # comment.
const TAIL = String.raw`\s*(?:#.*)?$`;
const STRING = new RegExp(String.raw`^"((?:[^"\\]|\\.)*)"${TAIL}`);
const LITERAL = new RegExp(String.raw`^'([^']*)'${TAIL}`);
const BARE = new RegExp(String.raw`^(true|false|[+-]?\d+)${TAIL}`);

// The text a value stands for, or null when it isn't a shape this reads (or holds a control character, which would
// break the one printed line).
function readValue(text) {
  let value = null;
  const quoted = STRING.exec(text);
  if (quoted) {
    try {
      value = JSON.parse(`"${quoted[1]}"`);
    } catch {
      return null; // an escape TOML has and JSON hasn't, e.g. \U0001F600: not read
    }
  } else if (LITERAL.test(text)) {
    value = LITERAL.exec(text)[1];
  } else if (BARE.test(text)) {
    value = BARE.exec(text)[1];
  }
  return value === null || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(value) ? null : value;
}

/** What one profile says about `section.key`: { found: false }, or { found: true, value } (value null: not a shape this reads). */
export function lookup(toml, section, key) {
  let current = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      const header = /^\[\s*([^[\]]*?)\s*\]\s*(?:#.*)?$/.exec(line);
      current = header ? header[1].replace(/\s*\.\s*/g, ".") : null; // [[array tables]] and odd headers open no section
      continue;
    }
    const pair = current === section ? /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line) : null;
    if (pair?.[1] === key) return { found: true, value: readValue(pair[2]) };
  }
  return { found: false };
}

// A profile's text, or null when the file isn't there. Any other failure (a folder, no rights) is the caller's to see.
function readLayer(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

/** Prints `value (layer)` and returns 0; returns 1 with one line on `error` when the key has no value; 2 when the name is wrong. */
export function configGet(name, dir = ".", { home = homedir(), kitDir, log = console.log, error = console.error } = {}) {
  if (!NAME.test(name ?? "")) return error(`Name the setting as section.key, e.g. defaults.risk_dial (got "${name ?? ""}"). Run: npx onrails --help`), 2;
  if (looksSecret(name)) return error(`${name} looks like a token, key or secret, so config get prints nothing for it. Read the profile file yourself.`), 1;
  const [section, key] = name.split(".");
  const layers = [
    ["project", () => readLayer(toNative(resolve(dir), "docs/profile.toml"))],
    ["personal", () => readLayer(profilePath(home))],
    ["kit default", () => loadKit(kitDir).readCore(TEMPLATE).toString("utf8")],
  ];
  for (const [layer, read] of layers) {
    const toml = read();
    const found = toml === null ? { found: false } : lookup(toml, section, key);
    if (!found.found || found.value === "") continue; // not here, or blank: ask the next layer
    if (found.value === null) return error(`${name} is set in the ${layer} profile in a form config get doesn't read (it reads "text", true, false and whole numbers).`), 1;
    return log(`${found.value} (${layer})`), 0;
  }
  return error(`${name} isn't set in the project profile, your profile or the kit's profile template.`), 1;
}
