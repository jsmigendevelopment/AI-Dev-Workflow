#!/usr/bin/env node
// Is a newer onRails on npm? (#448) Used by the session-start hook and /back (`line`) and doctor.
//   node latest.mjs line [--root <dir>]    one line when something is behind, else nothing
// It reads https://registry.npmjs.org/onrails/latest at most once a day, keeps the answer in ~/.onrails/latest.json, and
// gives up after 2 seconds. Offline, a timeout, a proxy refusal or bad data: it prints nothing and never fails the session.
// The request is a plain GET: nothing about the project, no identifiers, no headers of ours.
// [updates] check = "daily" | "weekly" | "off" in docs/profile.toml, else ~/.onrails/profile.toml.
// ONRAILS_REGISTRY and ONRAILS_CHANGELOG_URL point the check at a fake in tests; ONRAILS_NOW sets the clock.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const REGISTRY = "https://registry.npmjs.org";
const CHANGELOG_URL = "https://raw.githubusercontent.com/jsmigendevelopment/onrails/main/CHANGELOG.md";
export const CHANGELOG_LINK = "https://github.com/jsmigendevelopment/onrails/blob/main/CHANGELOG.md";
const TIMEOUT_MS = 2000;
const DAY_MS = 24 * 3600e3;
const WINDOW_DAYS = { daily: 1, weekly: 7 };
const VERSION = /^\d+\.\d+\.\d+$/;

// ~/.onrails, or ~/.ai-dev-workflow (its name before the rename) while only that one exists, as notify.mjs reads it.
function homeDir(home) {
  const now = join(home, ".onrails");
  const old = join(home, ".ai-dev-workflow");
  return !existsSync(now) && existsSync(old) ? old : now;
}

// One key from [section]: docs/profile.toml in the project first, then the home profile (the read notify.mjs does).
function setting(root, home, section, key) {
  for (const path of [join(root, "docs", "profile.toml"), join(homeDir(home), "profile.toml")]) {
    let text;
    try { text = readFileSync(path, "utf8"); } catch { continue; } // no profile here: try the next one
    const body = text.split(new RegExp(`^\\[${section}\\]\\s*$`, "m"))[1]?.split(/^\[/m)[0];
    const m = body?.match(new RegExp(`^\\s*${key}\\s*=\\s*("([^"]*)"|[^\\s#]+)`, "m"));
    if (m && (m[2] ?? m[1]) !== "") return m[2] ?? m[1];
  }
  return undefined;
}

/** The [updates] switch: check is daily, weekly or off. An unknown value means daily. */
export function settings(root, home = homedir()) {
  const check = setting(root, home, "updates", "check")?.toLowerCase();
  return { check: ["daily", "weekly", "off"].includes(check) ? check : "daily" };
}

const parts = (v) => v.split(".").map(Number);

/** "major", "minor" or "patch" when `latest` is newer than `current`, else null (also for anything that isn't x.y.z). */
export function bumpKind(latest, current) {
  if (!VERSION.test(latest ?? "") || !VERSION.test(current ?? "")) return null;
  const [a, b] = [parts(latest), parts(current)];
  const i = [0, 1, 2].find((n) => a[n] !== b[n]);
  return i === undefined || a[i] < b[i] ? null : ["major", "minor", "patch"][i];
}

/** True when the release's own section in the CHANGELOG has a Breaking heading. */
export function hasBreaking(changelog, version) {
  const start = changelog.search(new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m"));
  if (start < 0) return false;
  const rest = changelog.slice(start + 3);
  const end = rest.search(/^## /m);
  return /^#{3,4}\s*\**breaking/im.test(end < 0 ? rest : rest.slice(0, end));
}

const cacheFile = (home) => join(homeDir(home), "latest.json");

// A JSON file's value, or null when it is missing or unreadable: callers treat both as "nothing there".
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const readCache = (home) => {
  const cache = readJson(cacheFile(home));
  return cache && typeof cache === "object" ? cache : null;
};

function writeCache(home, cache) {
  try {
    mkdirSync(homeDir(home), { recursive: true });
    writeFileSync(cacheFile(home), `${JSON.stringify(cache)}\n`);
  } catch {
    return false; // a read-only home only costs another check
  }
  return true;
}

// The registry's answer, and whether the release's changelog has a Breaking section (null: couldn't tell). One 2-second
// budget covers both requests. Any failure is null: nothing is printed and the session goes on.
async function fetchLatest({ registry, changelog, timeoutMs, known }) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(`${registry}/onrails/latest`, { signal });
    if (!res.ok) return null;
    const version = (await res.json())?.version;
    if (!VERSION.test(version ?? "")) return null;
    if (known?.latest === version && typeof known.breaking === "boolean") return { version, breaking: known.breaking };
    const text = await fetch(changelog, { signal }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
    return { version, breaking: text === null ? null : hasBreaking(text, version) };
  } catch {
    return null; // offline, a timeout, a refusing proxy or bad JSON
  }
}

const answer = (cache) => (VERSION.test(cache?.latest ?? "") ? { version: cache.latest, breaking: cache.breaking === true } : null);

/**
 * The latest release as { version, breaking }, or null when it can't be known. Reads the cache while it is fresh (a day, or
 * a week for "weekly"), else asks the registry once and records the try, so a hang costs one wait a day. "off" does nothing.
 */
export async function latestVersion({ home = homedir(), now = Date.now(), check = "daily", registry = REGISTRY, changelog = CHANGELOG_URL, timeoutMs = TIMEOUT_MS } = {}) {
  if (check === "off") return null;
  const cache = readCache(home);
  const age = now - Date.parse(cache?.checkedAt);
  if (age >= 0 && age < WINDOW_DAYS[check] * DAY_MS) return answer(cache);
  const got = await fetchLatest({ registry, changelog, timeoutMs, known: cache });
  const next = got
    ? { checkedAt: new Date(now).toISOString(), latest: got.version, breaking: got.breaking }
    : { checkedAt: new Date(now).toISOString(), latest: cache?.latest ?? null, breaking: cache?.breaking ?? null };
  writeCache(home, next);
  return answer(next);
}

/** The last answer the check kept, however old, and never a request: for doctor, which stays offline. */
export const cachedLatest = (home = homedir()) => answer(readCache(home));

/** Each onRails plugin installed here: [{ label, version }], read from the agents' own install records (as plugin.mjs does). */
export function pluginVersions(home = homedir(), env = process.env) {
  const found = [];
  const claudeRoot = env.CLAUDE_CODE_PLUGIN_CACHE_DIR || join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "plugins");
  const claude = readJson(join(claudeRoot, "installed_plugins.json"))?.plugins?.["core@onrails"]?.[0]?.version;
  if (VERSION.test(claude ?? "")) found.push({ label: "Claude Code", version: claude });
  const codexDir = join(env.CODEX_HOME || join(home, ".codex"), "plugins", "cache", "onrails", "or");
  const folders = existsSync(codexDir) ? readdirSync(codexDir) : [];
  const codex = folders.filter((v) => VERSION.test(v)).sort((a, b) => (bumpKind(a, b) ? -1 : 1)).at(0);
  if (codex) found.push({ label: "Codex", version: codex });
  return found;
}

/** The repo's kit version from .onrails.json (or .ai-dev-workflow.json, its name before the rename), else null. */
export function kitVersion(root) {
  const manifest = readJson(join(root, ".onrails.json")) ?? readJson(join(root, ".ai-dev-workflow.json"));
  return manifest?.kitVersion ?? null;
}

/** The one line to show, or "" when nothing is behind. latest: { version, breaking }; plugins: [{ label, version }]. */
export function updateLine({ latest, kit = null, plugins = [] }) {
  const have = [kit && { text: `this repo has ${kit}`, version: kit }, ...plugins.map((p) => ({ text: `the ${p.label} plugin ${p.version}`, version: p.version }))].filter(Boolean);
  const behind = have.filter((h) => bumpKind(latest.version, h.version));
  if (!behind.length) return "";
  const where = `(${have.map((h) => h.text).join(", ")})`;
  if (behind.some((h) => bumpKind(latest.version, h.version) === "major")) {
    return `onRails ${latest.version} is a major release ${where}. It may break things: read ${CHANGELOG_LINK} first, then run /update.`;
  }
  if (latest.breaking) return `onRails ${latest.version} is out ${where} and its changelog has a Breaking section: ${CHANGELOG_LINK}. Run /update to get it.`;
  return `onRails ${latest.version} is out ${where}. Run /update to get it.`;
}

const flag = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

/** The command line. Returns the exit code; `line` is always 0. */
export async function main(argv, env = process.env, log = console.log) {
  const root = flag(argv, "--root") ?? env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const home = homedir();
  const clock = Date.parse(env.ONRAILS_NOW ?? "");
  const switches = settings(root, home);
  const read = () => latestVersion({
    home, check: switches.check, now: Number.isFinite(clock) ? clock : Date.now(),
    registry: (env.ONRAILS_REGISTRY ?? REGISTRY).replace(/\/$/, ""), changelog: env.ONRAILS_CHANGELOG_URL ?? CHANGELOG_URL,
  });
  if (argv[0] === "line") {
    const latest = await read();
    const text = latest ? updateLine({ latest, kit: kitVersion(root), plugins: pluginVersions(home, env) }) : "";
    if (text) log(text);
    return 0;
  }
  console.error("Usage: latest.mjs line [--root <dir>]");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, () => { process.exitCode = process.argv[2] === "line" ? 0 : 1; });
}
