// Shared by the `update --all` tests (#178). Each test runs the CLI binary with a temp HOME and a PATH of temp
// folders that hold only fake `claude` and `codex` (they record every call) and a link to Node. Never Node's own
// folder: an npm-installed claude sits there. run() checks every child's PATH before it starts.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { init } from "../src/init.mjs";
import { logger, makeKit, put, tmp } from "./helpers.mjs";

export const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
export const repo = (path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A fake tool: logs "<name> <args>" and, for its plugin update command, installs FAKE_NEW the way the real one would.
const FAKE = (name, onUpdate) => `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, ${JSON.stringify(name)} + " " + args.join(" ") + "\\n");
if (args[0] === "--version") { console.log("1.0.0"); process.exit(0); }
if (process.env.FAKE_FAIL === args.join(" ")) { console.error("network down"); process.exit(1); }
const home = process.env.HOME, v = process.env.FAKE_NEW;
${onUpdate}
`;
export const CLAUDE = FAKE("claude", `if (args.join(" ") === "plugin update core@onrails") {
  fs.writeFileSync(path.join(home, ".claude/plugins/installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "core@onrails": [{ scope: "user", version: v }] } }));
}`);
const CODEX = FAKE("codex", `if (args.join(" ") === "plugin marketplace upgrade onrails") {
  fs.mkdirSync(path.join(home, ".codex/plugins/cache/onrails/or", v), { recursive: true });
}`);
// A claude a project could ship: it only records that it ran.
export const PLANTED = `#!/usr/bin/env node
require("fs").appendFileSync(process.env.FAKE_LOG, "planted " + process.argv.slice(2).join(" ") + "\\n");
`;
const claudeRecord = (v) => JSON.stringify({ version: 2, plugins: { "core@onrails": [{ scope: "user", installPath: "/x", version: v }] } });

// Every fake this test file made, by real path. run() lets a child see no other claude or codex.
const fakes = new Set();

/** Writes an executable fake tool and records it as one of this test's fakes. */
export function fake(dir, name, body) {
  put(dir, name, body);
  chmodSync(join(dir, name), 0o755);
  fakes.add(realpathSync(join(dir, name)));
}

// A text scan of the test files can't see every way Node's folder or the shell's PATH reaches a child, so this
// checks the PATH itself: a claude or codex that isn't a fake (the real one next to Node) stops the test first.
function onlyFakes(PATH = "", cwd = process.cwd()) {
  for (const entry of PATH.split(delimiter).filter(Boolean)) {
    for (const name of ["claude", "codex", "claude.cmd", "codex.cmd", "claude.exe", "codex.exe"]) {
      const file = resolve(cwd, entry, name);
      if (existsSync(file) && !fakes.has(realpathSync(file))) throw new Error(`${file} on the child's PATH isn't one of this test's fakes`);
    }
  }
}

/** A new temp folder that holds only a link to Node, so `#!/usr/bin/env node` fakes start and nothing else is found. */
export function nodeOnly(dir = tmp("onrails-node-")) {
  symlinkSync(process.execPath, join(dir, "node"));
  return dir;
}

/** A machine: temp HOME, fake tools on PATH, both plugins at 0.6.0 and a stale global idea skill unless told otherwise. */
export function machine({ tools = ["claude", "codex"], plugins = tools, global = true, home = tmp("onrails-home-") } = {}) {
  const bin = nodeOnly(tmp("onrails-bin-"));
  for (const t of tools) fake(bin, t, t === "claude" ? CLAUDE : CODEX);
  if (plugins.includes("claude")) put(home, ".claude/plugins/installed_plugins.json", claudeRecord("0.6.0"));
  if (plugins.includes("codex")) put(home, ".codex/plugins/cache/onrails/or/0.6.0/skills/idea/SKILL.md", "x");
  if (global) put(home, ".claude/skills/idea/SKILL.md", "an older idea\n");
  const logFile = join(bin, "calls.log");
  // Only these variables: no CLAUDE_CONFIG_DIR, CODEX_HOME or real PATH from the shell running the tests.
  const env = { PATH: bin, HOME: home, USERPROFILE: home, TMPDIR: dirname(home), FAKE_LOG: logFile, FAKE_NEW: "0.7.9" };
  const run = (args, extra = {}, cwd = undefined) => {
    const childEnv = { ...env, ...extra };
    onlyFakes(childEnv.PATH, cwd);
    return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: childEnv });
  };
  return { home, bin, env, run, calls: () => (existsSync(logFile) ? readFileSync(logFile, "utf8") : "") };
}

/** A project with an older kit installed. */
export function project() {
  const dir = tmp();
  init(dir, { kitDir: makeKit("0.1.0", { "AGENTS.md": "rules v1\n" }), log: logger() });
  return dir;
}

/** A machine whose only claude is in ~/.local/bin, where Claude Code's native installer puts it. */
export function homeInstall() {
  const m = machine({ tools: [], plugins: ["claude"], global: false });
  const local = join(m.home, ".local", "bin");
  fake(local, "claude", CLAUDE);
  return { ...m, PATH: [local, nodeOnly()].join(delimiter) };
}

export const pluginCalls = (m) => m.calls().split("\n").filter((l) => / plugin /.test(l));
export const BOTH = ["claude plugin marketplace update onrails", "claude plugin update core@onrails"];
