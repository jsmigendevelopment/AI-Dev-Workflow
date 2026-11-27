// The deny set for kit lessons (#322): words that belong to the project itself, so `lesson check --project` can refuse
// them even where #321's allowlist passes them ("Notes" is a common word and an app name). Local files and local git
// only, never the network. A term's source kind may be printed; the term never is.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { homeDir } from "./home.mjs";
import { GLOSSARY } from "./lesson-words.mjs";

const DOCS = ["docs/vision.md", "docs/mvp.md", "docs/decisions.md"];
// Rule 9: .env and its siblings are never opened. .env.example is the one that may be, for its variable names.
const ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/;
const ENV_EXAMPLE = ".env.example";
const MAX_SCAN = 1024 * 1024;
// Hosts that are never a project's own (RFC 2606 and 6761), so `example` doesn't block every lesson.
const RESERVED = /(^|\.)(localhost|test|example|invalid|local)$|(^|\.)example\.(com|net|org)$/;
// A second-level label under a country code, as in co.uk, so the name label is the one before it.
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

// Lowercase, and `_` read as `-`, so MY_VAR and my-var are the same term.
const norm = (text) => text.toLowerCase().replaceAll("_", "-");
const trimEnds = (word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    // Not a git repo, or no git: this source adds nothing.
    return "";
  }
}

function readText(path) {
  try {
    if (statSync(path).size > MAX_SCAN) return "";
    const text = readFileSync(path, "utf8");
    return text.includes("\0") ? "" : text;
  } catch {
    // A missing or unreadable file adds nothing.
    return "";
  }
}

// A term and, split on - . +, each of its parts. Kit words never enter: `review` in a repo name can't block every lesson.
function adder(terms, kitWords) {
  const add = (raw, kind, { split = true } = {}) => {
    const term = trimEnds(norm(raw));
    const parts = split ? term.split(/[-.+]/) : [];
    for (const word of [term, ...parts]) {
      if (word.length >= 2 && !kitWords.has(word) && !terms.has(word)) terms.set(word, kind);
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

function packageTerms(dir, files, add) {
  const paths = new Set(["package.json", ...files.filter((f) => basename(f) === "package.json" && !f.includes("node_modules/"))]);
  for (const path of paths) {
    let name;
    try { name = JSON.parse(readText(join(dir, path))).name; } catch { continue; } // Not JSON: no name to add.
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

function docTerms(dir, add) {
  let decisions = [];
  try {
    decisions = readdirSync(join(dir, "docs/decisions")).filter((f) => f.endsWith(".md")).map((f) => `docs/decisions/${f}`);
  } catch {
    // No decisions folder: only the single files count.
  }
  for (const path of [...DOCS, ...decisions]) {
    for (const word of docWords(readText(join(dir, path)))) add(word, "docs");
  }
}

// [me] name and github_owner from the project's profile, else the person's own.
function profileTerms(dir, home, add) {
  const text = readText(join(dir, "docs/profile.toml")) || readText(join(homeDir(home), "profile.toml"));
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

// Hosts in URLs and email addresses in tracked files. .env files are skipped by name, before any read.
function domainTerms(dir, files, add) {
  const host = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@]+@)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})|[\w.+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b/gi;
  for (const path of files) {
    if (ENV_FILE.test(path) && basename(path) !== ENV_EXAMPLE) continue;
    for (const match of readText(join(dir, path)).matchAll(host)) addDomain(add, match[1] ?? match[2], "domain");
  }
}

function envTerms(dir, add) {
  for (const match of readText(join(dir, ENV_EXAMPLE)).matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
    add(match[1], "env name", { split: false });
  }
}

/** The project's own terms, lowercase, each mapped to its source kind. Reads local files and local git only. */
export function denySet(projectDir, { home = homedir(), kitWords = GLOSSARY } = {}) {
  const terms = new Map();
  const add = adder(terms, kitWords);
  const files = git(projectDir, ["ls-files", "-z"]).split("\0").filter(Boolean);
  remoteTerms(projectDir, add);
  packageTerms(projectDir, files, add);
  docTerms(projectDir, add);
  profileTerms(projectDir, home, add);
  authorTerms(projectDir, add);
  domainTerms(projectDir, files, add);
  envTerms(projectDir, add);
  return terms;
}

const matchers = new WeakMap();

/** The source kind of the first project term in text, whole-word and case-blind, or null. */
export function projectTerm(text, terms) {
  if (terms.size === 0) return null;
  let pattern = matchers.get(terms);
  if (!pattern) {
    const alternatives = [...terms.keys()].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "u");
    matchers.set(terms, pattern);
  }
  const found = pattern.exec(norm(text));
  return found ? terms.get(found[0]) : null;
}
