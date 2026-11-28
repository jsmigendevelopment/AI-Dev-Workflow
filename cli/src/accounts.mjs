// accounts [dir]: the [accounts] tables in the profile, and doctor's check that each
// account's config folder exists. It only checks that the folder is there: it never
// lists, opens or reads anything inside it, because that is where logins are kept.
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { FAIL, OK } from "./marks.mjs";
import { profilePath } from "./profile.mjs";

const TOOLS = ["claude", "codex"];
const RULE = "A fixed split by job or project. At a limit, an account's work waits for its reset; it never moves to another account. One exception: when you use Codex, non-security builds may go to ChatGPT. Never to a second Claude account.";
const HOW = "the routing skill's references/accounts.md";

// One { key, label, tool, config_dir, projects, jobs } per [accounts.<key>] table.
export function parseAccounts(toml) {
  const accounts = [];
  let current = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const table = /^\[\s*accounts\.([A-Za-z0-9_-]+)\s*\]$/.exec(line);
    if (table) {
      current = { key: table[1], label: "", tool: "", config_dir: "", projects: [], jobs: [] };
      accounts.push(current);
      continue;
    }
    if (line.startsWith("[")) { current = null; continue; }
    const pair = current && /^([a-z_]+)\s*=\s*(.+)$/.exec(line);
    if (pair && pair[1] in current) current[pair[1]] = parseValue(pair[2]);
  }
  return accounts;
}

// A "string" or a ["list", "of", "strings"]; the only shapes [accounts] uses.
function parseValue(text) {
  if (text.startsWith("[")) return [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  return /^"([^"]*)"/.exec(text)?.[1] ?? text;
}

// The project's docs/profile.toml first, then the home profile, the order the hooks read.
export function readAccounts(projectDir = ".", { home = homedir() } = {}) {
  for (const path of [join(resolve(projectDir), "docs", "profile.toml"), profilePath(home)]) {
    if (!existsSync(path)) continue;
    const accounts = parseAccounts(readFileSync(path, "utf8"));
    if (accounts.length) return { path, accounts };
  }
  return { path: null, accounts: [] };
}

export const expandHome = (dir, home = homedir()) => dir === "~" ? home : dir.replace(/^~(?=[/\\])/, home);

function isFolder(path) {
  try { return statSync(path).isDirectory(); } catch { return false; } // missing is the answer, not an error
}

export function accountsList(dir = ".", { home = homedir(), log = console.log } = {}) {
  const { path, accounts } = readAccounts(dir, { home });
  if (!accounts.length) {
    log(`No [accounts] in docs/profile.toml or ${profilePath(home)}. Every job runs on the account you're signed in with.`);
    return 0;
  }
  log(`# ${path}\n${RULE}\n`);
  for (const a of accounts) {
    const found = a.config_dir && isFolder(expandHome(a.config_dir, home));
    log(`${a.key}: ${a.label || "(no label)"} · ${a.tool || "(no tool)"} · ${a.config_dir || "(no config_dir)"}${found ? "" : " (folder not found)"}`);
    log(`    projects: ${a.projects.join(", ") || "none"} · jobs: ${a.jobs.join(", ") || "none"}`);
  }
  return 0;
}

// For doctor: one line per account. None when the profile has no accounts.
export function accountChecks(projectDir, { home = homedir() } = {}) {
  return readAccounts(projectDir, { home }).accounts.map((a) => {
    const name = `Account ${a.key}${a.label ? ` (${a.label})` : ""}`;
    if (!TOOLS.includes(a.tool)) {
      return { status: FAIL, label: `${name}: tool is "${a.tool}"`, fix: `Set tool = "claude" or "codex" in [accounts.${a.key}]`, required: false };
    }
    if (!a.config_dir) {
      return { status: FAIL, label: `${name}: no config_dir`, fix: `Set config_dir in [accounts.${a.key}]`, required: false };
    }
    const ok = isFolder(expandHome(a.config_dir, home));
    return {
      status: ok ? OK : FAIL,
      label: ok ? `${name}: ${a.config_dir} exists` : `${name}: ${a.config_dir} not found`,
      fix: `Sign it in from your terminal: see ${HOW}`,
      required: false,
    };
  });
}
