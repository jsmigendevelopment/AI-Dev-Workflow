// #178: `update --all` brings the plugins, the global entry skills and the project's kit to the latest.
// Each test runs the CLI binary with a temp HOME and a PATH that holds only fake `claude` and `codex`
// (they record every call) and Node itself, so no real plugin command runs and the real home is never read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { init } from "../src/init.mjs";
import { exists, logger, makeKit, put, read, tmp, unixOnly } from "./helpers.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const repo = (path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
const CLAUDE = FAKE("claude", `if (args.join(" ") === "plugin update core@onrails") {
  fs.writeFileSync(path.join(home, ".claude/plugins/installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "core@onrails": [{ scope: "user", version: v }] } }));
}`);
const CODEX = FAKE("codex", `if (args.join(" ") === "plugin marketplace upgrade onrails") {
  fs.mkdirSync(path.join(home, ".codex/plugins/cache/onrails/or", v), { recursive: true });
}`);
const claudeRecord = (v) => JSON.stringify({ version: 2, plugins: { "core@onrails": [{ scope: "user", installPath: "/x", version: v }] } });

/** A machine: temp HOME, fake tools on PATH, both plugins at 0.6.0 and a stale global idea skill unless told otherwise. */
function machine({ tools = ["claude", "codex"], plugins = tools, global = true } = {}) {
  const home = tmp("onrails-home-"), bin = tmp("onrails-bin-");
  for (const t of tools) put(bin, t, t === "claude" ? CLAUDE : CODEX), chmodSync(join(bin, t), 0o755);
  if (plugins.includes("claude")) put(home, ".claude/plugins/installed_plugins.json", claudeRecord("0.6.0"));
  if (plugins.includes("codex")) put(home, ".codex/plugins/cache/onrails/or/0.6.0/skills/idea/SKILL.md", "x");
  if (global) put(home, ".claude/skills/idea/SKILL.md", "an older idea\n");
  const logFile = join(bin, "calls.log");
  // Only these variables: no CLAUDE_CONFIG_DIR, CODEX_HOME or real PATH from the shell running the tests.
  const env = { PATH: [bin, dirname(process.execPath)].join(delimiter), HOME: home, USERPROFILE: home, TMPDIR: dirname(home), FAKE_LOG: logFile, FAKE_NEW: "0.7.9" };
  const run = (args, extra = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...env, ...extra } });
  return { home, bin, run, calls: () => (existsSync(logFile) ? readFileSync(logFile, "utf8") : "") };
}

/** A project with an older kit installed. */
function project() {
  const dir = tmp();
  init(dir, { kitDir: makeKit("0.1.0", { "AGENTS.md": "rules v1\n" }), log: logger() });
  return dir;
}

test("AC-178-1: WHEN update --all --dry-run runs with both plugins and global skills THEN it prints the plan for all four parts and runs nothing", unixOnly, () => {
  const m = machine(), dir = project();
  const before = read(dir, ".onrails.json");
  const r = m.run(["update", dir, "--all", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.match(out, new RegExp(`Claude Code plugin core@onrails v0\\.6\\.0: would run\\n\\s+${esc(join(m.bin, "claude"))} plugin marketplace update onrails\\n\\s+${esc(join(m.bin, "claude"))} plugin update core@onrails`));
  assert.match(out, new RegExp(`Codex plugin or@onrails v0\\.6\\.0: would run\\n\\s+${esc(join(m.bin, "codex"))} plugin marketplace upgrade onrails`));
  assert.match(out, /Global entry skills: would refresh ~\/\.claude\/skills and ~\/\.agents\/skills/);
  assert.match(out, new RegExp(`Plan \\(dry run, nothing written\\): kit v0\\.1\\.0 -> v${esc(version)}`));
  assert.match(out, /doctor: would run after the updates/);
  assert.equal(m.calls(), "", "no fake tool was called, not even for --version");
  assert.equal(read(m.home, ".claude/skills/idea/SKILL.md"), "an older idea\n");
  assert.ok(!exists(m.home, ".agents/skills/idea/SKILL.md"), "no global skill written");
  assert.equal(read(dir, ".onrails.json"), before, "the project kit is untouched");
});

test("AC-178-2: WHEN update --all runs THEN it updates both plugins, refreshes global skills and the project kit, runs doctor and prints before and after", unixOnly, () => {
  const m = machine(), dir = project();
  const r = m.run(["update", dir, "--all"]);
  assert.equal(r.status, 0, r.stderr);
  const plugin = m.calls().split("\n").filter((l) => / plugin /.test(l));
  assert.deepEqual(plugin, ["claude plugin marketplace update onrails", "claude plugin update core@onrails", "codex plugin marketplace upgrade onrails"]);
  // Global skills, the init --global way: added where missing, the person's copy kept with the kit's next to it.
  assert.ok(exists(m.home, ".agents/skills/idea/SKILL.md") && exists(m.home, ".claude/skills/back/SKILL.md"));
  assert.equal(read(m.home, ".claude/skills/idea/SKILL.md"), "an older idea\n");
  assert.ok(exists(m.home, ".claude/skills/idea/SKILL.md.onrails-new"));
  assert.equal(JSON.parse(read(dir, ".onrails.json")).kitVersion, version);
  assert.match(m.calls(), /^claude --version$/m, "doctor ran after the updates");
  const summary = r.stdout.slice(r.stdout.lastIndexOf("Summary"));
  assert.match(summary, /Claude Code plugin core@onrails: v0\.6\.0 -> v0\.7\.9/);
  assert.match(summary, /Codex plugin or@onrails: v0\.6\.0 -> v0\.7\.9/);
  assert.match(summary, new RegExp(`Global entry skills: idea differed from kit v${esc(version)} -> idea still differs`));
  assert.match(summary, new RegExp(`Project kit: v0\\.1\\.0 -> v${esc(version)}`));
  assert.match(summary, /Compare each \.onrails-new in ~\/\.claude\/skills/);
  assert.match(summary, /Claude Code: run `\/reload-plugins` in each open session/);
  assert.ok(r.stdout.indexOf("Summary") > r.stdout.indexOf("required checks"), "the summary comes after doctor");
});

test("AC-178-3: WHEN update --all runs outside a project THEN it skips the project step and says so", unixOnly, () => {
  const m = machine({ global: false }), dir = tmp();
  const r = m.run(["update", dir, "--all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Project kit: skipped, this folder isn't an onRails project \(no \.onrails\.json\)/);
  assert.ok(!exists(dir, ".onrails.json") && !exists(dir, "AGENTS.md"), "nothing installed");
  assert.match(r.stdout, /Global entry skills: skipped, init --global was never run here/);
  assert.ok(!exists(m.home, ".claude/skills"), "no global skills made");
});

test("#178: a tool runs only when it and its plugin are both there; a failed command is reported, the rest still runs, and the exit is 1", unixOnly, () => {
  const m = machine({ tools: ["claude"], plugins: ["codex"], global: false });
  let r = m.run(["update", tmp(), "--all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(m.calls(), / plugin /);
  assert.match(r.stdout, /Claude Code plugin: not installed, skipped/);
  assert.match(r.stdout, /Codex plugin or@onrails v0\.6\.0: skipped, codex isn't on your PATH/);

  const both = machine({ global: false });
  r = both.run(["update", tmp(), "--all"], { FAKE_FAIL: "plugin marketplace update onrails" });
  assert.equal(r.status, 1);
  assert.match(both.calls(), /^codex plugin marketplace upgrade onrails$/m, "Codex still updates");
  assert.doesNotMatch(both.calls(), /claude plugin update/, "Claude Code stops at its failed step");
  assert.match(r.stdout, /Claude Code plugin core@onrails: v0\.6\.0 -> v0\.6\.0 \(FAILED: .*claude plugin marketplace update onrails\)/);
});

test("#178: plain update still updates only the project, and never calls a plugin tool", unixOnly, () => {
  const m = machine(), dir = project();
  const r = m.run(["update", dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(m.calls(), "");
  assert.equal(read(m.home, ".claude/skills/idea/SKILL.md"), "an older idea\n");
  assert.ok(!exists(m.home, ".agents/skills"));
});

test("AC-178-4: WHEN the plugin is read THEN it has an /update skill that runs update --all, ends on /reload-plugins, and on Full asks nothing", () => {
  const skill = repo("plugin/skills/update/SKILL.md");
  assert.equal(skill, repo(".agents/skills/update/SKILL.md"), "the plugin's copy is the master's");
  assert.match(skill, /^---\nname: update\ndescription: Use when /);
  assert.match(skill, /npx onrails@latest update --all/);
  assert.match(skill, /--dry-run/);
  assert.match(skill, /\*\*On Full,\*\* ask nothing/);
  assert.match(skill, /\*\*Below Full,\*\* show the plan and ask once/);
  const last = skill.trimEnd().split("\n").filter((l) => l.trim()).at(-1);
  assert.match(last, /run `\/reload-plugins`/i, "the last line tells the person to run /reload-plugins");
  assert.doesNotMatch(skill, /npm version|npm publish|git tag/, "it never bumps, tags or publishes");
});

test("AC-178-5: WHEN the README and cli/CLI.md are read THEN they name /update and update --all, and the by-hand line points to them", () => {
  const readme = repo("README.md"), cli = repo("cli/CLI.md");
  for (const [name, text] of [["README.md", readme], ["cli/CLI.md", cli]]) {
    assert.match(text, /`\/update`/, name);
    assert.match(text, /update --all/, name);
  }
  const byHand = readme.split("\n").find((l) => l.includes("**Update the plugin")) ?? "";
  assert.match(byHand, /`\/update`/);
  assert.match(byHand, /npx onrails@latest update --all/);
  assert.match(cli, /\| `npx onrails@latest update \[dir\] --all \[--dry-run\] \[--yes\]` \|/);
});
