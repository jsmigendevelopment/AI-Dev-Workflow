// The deny set for kit lessons (#322): words that belong to the project itself, so `lesson check --project` can refuse
// them even where #321's allowlist passes them ("Notes" is a common word and an app name). Local files and local git
// only, never the network. A term's source kind may be printed; the term never is.
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { hash } from "./files.mjs";
import { homeDir } from "./home.mjs";
import { GLOSSARY } from "./lesson-words.mjs";

const DOCS = ["docs/vision.md", "docs/mvp.md", "docs/decisions.md"];
// Rule 9: .env and its siblings are never opened. .env.example is the one that may be, for its variable names.
const ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/;
const ENV_EXAMPLE = ".env.example";
const MAX_SCAN = 1024 * 1024;
// The longest text scanned for split names, well past a lesson's 200 characters, so a huge field stays fast.
const JOINED_MAX = 2000;
// Hosts that are never a project's own (RFC 2606 and 6761), so `example` doesn't block every lesson. Any `example`
// label counts, as in a placeholder such as app.example.workers.dev.
const RESERVED = /(^|\.)(localhost|test|invalid|local)$|(^|\.)example(\.|$)/;
// A second-level label under a country code, as in co.uk, so the name label is the one before it.
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

// Lowercase, and `_` read as `-`, so MY_VAR and my-var are the same term.
const norm = (text) => text.toLowerCase().replaceAll("_", "-");
const trimEnds = (word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
// Where a name breaks into parts: - . + _, a lower-to-upper step (GardenParty), the end of a capital run (APIKey) and
// a letter-to-digit step (Tide4Lamp).
const PART_BREAK = /[-.+_]|(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})|(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u;
const isEnvFile = (path) => ENV_FILE.test(path.replaceAll(sep, "/")) && basename(path) !== ENV_EXAMPLE;

/** The singular of a plural term (notes to note, boxes to box), or null. Short words and -ss words keep their s. */
export function singular(word) {
  const stem = /(s|x|z|ch|sh)es$/.test(word) ? word.slice(0, -2) : /[^s]s$/.test(word) ? word.slice(0, -1) : null;
  return word.length >= 4 && stem && stem.length >= 3 ? stem : null;
}

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    // Not a git repo, or no git: this source adds nothing.
    return "";
  }
}

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

// Reads files under root. A link is followed only when its real path isn't an .env file and stays under root (or,
// with `anywhere`, for the person's own profile kept in a dotfiles folder, goes anywhere); a folder, a device or a
// pipe is never opened, and a file over MAX_SCAN gives nothing.
function reader(root, { anywhere = false } = {}) {
  let top;
  try { top = realpathSync(root); } catch { return { text: () => "", folder: () => null }; } // No such folder: nothing to read.
  const locate = (path) => {
    if (isEnvFile(path)) return null;
    const real = realpathSync(join(top, path));
    return (anywhere || inside(top, real)) && !isEnvFile(real) ? real : null;
  };
  const text = (path) => {
    try {
      const real = locate(path);
      return real && lstatSync(real).isFile() ? readCapped(real) : "";
    } catch {
      // A missing or unreadable file adds nothing.
      return "";
    }
  };
  const folder = (path) => {
    try { return locate(path); } catch { return null; } // No such folder.
  };
  return { text, folder };
}

// A regular file of at most MAX_SCAN bytes, as text; anything else, or a NUL byte, gives "".
function readCapped(path) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) return "";
    // One byte past the size it says, so a file that grew past the cap is still caught.
    const buffer = Buffer.allocUnsafe(Math.min(info.size, MAX_SCAN) + 1);
    let size = 0;
    for (let n; size < buffer.length && (n = readSync(fd, buffer, size, buffer.length - size, size)) > 0;) size += n;
    if (size > MAX_SCAN) return "";
    const text = buffer.toString("utf8", 0, size);
    return text.includes("\0") ? "" : text;
  } finally {
    closeSync(fd);
  }
}

// A term, each of its parts, and the parts joined by `-` and by a space. A term kept whole (an env name, a full host)
// still gives the joins, so RIVER_SIGNAL_TOKEN gives `river signal token`, but not its parts. Kit words never enter,
// nor a term whose singular or plural is one: `review` or `reviews` in a repo name can't block every lesson.
function adder(terms, kitWords) {
  const isKit = (word) => [word, `${word}s`, `${word}es`, singular(word)].some((form) => form && kitWords.has(form));
  const add = (raw, kind, { split = true } = {}) => {
    const clean = trimEnds(raw);
    const parts = clean.split(PART_BREAK).map((part) => trimEnds(part.toLowerCase())).filter(Boolean);
    const joined = parts.length > 1 ? [parts.join("-"), parts.join(" ")] : [];
    for (const word of [norm(clean), ...(split ? parts : []), ...joined]) {
      if (word.length >= 2 && !isKit(word) && !terms.has(word)) terms.set(word, kind);
    }
  };
  return add;
}

// The name label of a host (fernway in api.fernway.dev, saltmarsh in saltmarsh.co.uk), and the host itself.
function addDomain(add, host, kind) {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (RESERVED.test(name)) return;
  const labels = name.split(".");
  if (labels.length < 2) return;
  const at = labels.length >= 3 && SECOND_LEVEL.has(labels.at(-2)) ? -3 : -2;
  add(name, kind, { split: false });
  add(labels.at(at), kind);
}

function remoteTerms(dir, add) {
  for (const line of git(dir, ["remote", "-v"]).split("\n")) {
    const url = line.split(/\s+/)[1] ?? "";
    const match = /([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
    if (match) for (const part of match.slice(1)) add(part, "git remote");
  }
}

function packageTerms(read, files, add) {
  const paths = new Set(["package.json", ...files.filter((f) => basename(f) === "package.json" && !f.includes("node_modules/"))]);
  for (const path of paths) {
    let name;
    try { name = JSON.parse(read.text(path)).name; } catch { continue; } // Not JSON: no name to add.
    if (typeof name === "string") for (const part of name.split(/[@/]/)) add(part, "package name");
  }
}

// Capitalised words that aren't a sentence's first, and capitalised words in a level-one title.
function docWords(text) {
  const words = [];
  for (const line of text.split(/\r?\n/)) {
    const title = /^#\s+(.*)$/.exec(line);
    const tokens = (title ? title[1] : line).split(/\s+/).filter(Boolean);
    tokens.forEach((raw, i) => {
      const word = /[\p{L}\p{N}][\p{L}\p{N}_-]*/u.exec(raw)?.[0] ?? "";
      if (!/^\p{Lu}/u.test(word)) return;
      // A quote or a bracket opens a sentence too, and a list marker such as (1) or a) or a closing bracket ends one.
      const before = (tokens[i - 1] ?? "").replace(/[*_\]"'`’”]+$/u, "");
      if (title || !/^["“‘'(`]/u.test(raw) && /[\p{Ll}\p{N},]$/u.test(before)) words.push(word);
    });
  }
  return words;
}

function docTerms(read, add) {
  let decisions = [];
  const folder = read.folder("docs/decisions");
  try {
    if (folder) decisions = readdirSync(folder).filter((f) => f.endsWith(".md")).map((f) => `docs/decisions/${f}`);
  } catch {
    // Not a folder: only the single files count.
  }
  for (const path of [...DOCS, ...decisions]) {
    for (const word of docWords(read.text(path))) add(word, "docs");
  }
}

// [me] name and github_owner from the project's profile, else the person's own.
function profileTerms(read, home, add) {
  const text = read.text("docs/profile.toml") || reader(homeDir(home), { anywhere: true }).text("profile.toml");
  const me = /^\[me\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text)?.[1] ?? "";
  for (const key of ["name", "github_owner"]) {
    const value = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m").exec(me)?.[1] ?? "";
    for (const word of value.split(/\s+/)) add(word, "profile");
  }
}

function authorTerms(dir, add) {
  const lines = git(dir, ["log", "--format=%an%n%ae"]).split("\n");
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const [name, email] = [lines[i], lines[i + 1]];
    // A bot is no one's private detail, and its name (github-actions) would block common words.
    if (/\[bot\]$/.test(name)) continue;
    for (const word of name.split(/\s+/)) add(word, "git author");
    const at = email.lastIndexOf("@");
    if (at < 0) continue;
    add(email.slice(0, at), "git author");
    addDomain(add, email.slice(at + 1), "git author");
  }
}

// Hosts in URLs and email addresses in tracked files. A file the kit ships, unchanged, holds none of the project's.
function domainTerms(read, files, kitFiles, add) {
  const host = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@]+@)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})|[\w.+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b/gi;
  for (const path of files) {
    const text = read.text(path);
    if (Object.hasOwn(kitFiles, path) && kitFiles[path] === hash(Buffer.from(text))) continue;
    for (const match of text.matchAll(host)) addDomain(add, match[1] ?? match[2], "domain");
  }
}

function envTerms(read, add) {
  for (const match of read.text(ENV_EXAMPLE).matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
    add(match[1], "env name", { split: false });
  }
}

/**
 * The project's own terms, lowercase, each mapped to its source kind. Reads local files and local git only.
 * `kitFiles` maps a kit path to its sha256, as the kit manifest does.
 */
export function denySet(projectDir, { home = homedir(), kitWords = GLOSSARY, kitFiles = {} } = {}) {
  const terms = new Map();
  const add = adder(terms, kitWords);
  const read = reader(projectDir);
  const files = git(projectDir, ["ls-files", "-z"]).split("\0").filter(Boolean);
  remoteTerms(projectDir, add);
  packageTerms(read, files, add);
  docTerms(read, add);
  profileTerms(read, home, add);
  authorTerms(projectDir, add);
  domainTerms(read, files, kitFiles, add);
  envTerms(read, add);
  return terms;
}

const matchers = new WeakMap();

// One pattern for every term and its singular, each with an optional plural `s` or `es` after it.
function matcher(terms) {
  const forms = new Map();
  for (const [term, kind] of terms) {
    for (const form of [term, singular(term)]) if (form && !forms.has(form)) forms.set(form, kind);
  }
  const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(" ", "\\s+");
  const alternatives = [...forms.keys()].sort((a, b) => b.length - a.length).map(escape);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${alternatives.join("|")})(?:e?s)?(?![\\p{L}\\p{N}])`, "u");
  // Every form with its spaces and hyphens removed, so a lesson that splits or joins a name its own way still
  // matches: `bright paper` for brightpaper, `river-signal token` for RIVER_SIGNAL_TOKEN.
  const joined = new Map();
  for (const [form, kind] of forms) {
    const key = form.replace(/[\s-]+/g, "");
    if (/^[\p{L}\p{N}]+$/u.test(key) && !joined.has(key)) joined.set(key, kind);
  }
  const longest = Math.max(0, ...[...joined.keys()].map((form) => form.length)) + 2;
  return { forms, pattern, joined, longest };
}

// The kind of a form that a run of two or more words spells with the spaces and hyphens removed (`bright paper` or
// `bright-paper` for `brightpaper`), in either number, or null.
function joinedTerm(text, { joined, longest }) {
  for (const chunk of text.split(/[^\p{L}\p{N}\s-]+/u)) {
    const words = chunk.split(/[\s-]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      let run = words[i];
      for (let j = i + 1; j < words.length && run.length < longest; j++) {
        run += words[j];
        const form = [run, run.replace(/s$/, ""), run.replace(/es$/, "")].find((f) => joined.has(f));
        if (form) return joined.get(form);
      }
    }
  }
  return null;
}

/**
 * The source kind of the first project term in text, whole-word, case-blind and in either number, or null. A term
 * also matches its letters with spaces or hyphens in other places (`bright paper`, `river-signal token`).
 */
export function projectTerm(text, terms) {
  if (terms.size === 0) return null;
  if (!matchers.has(terms)) matchers.set(terms, matcher(terms));
  const match = matchers.get(terms);
  const lower = norm(text);
  const found = match.pattern.exec(lower);
  if (found) return match.forms.get(found[1].replace(/\s+/g, " "));
  // Past JOINED_MAX the run scan is skipped: lesson check refuses such a field for its length anyway.
  return lower.length <= JOINED_MAX ? joinedTerm(lower, match) : null;
}
