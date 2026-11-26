// #178: `update --all` brings the plugins, the global entry skills and the project's kit to the latest.
// Each test runs the CLI binary with a temp HOME and a PATH that holds only fake `claude` and `codex`
// (they record every call) and Node itself, so no real plugin command runs and the real home is never read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { init } from "../src/init.mjs";
import { launch } from "../src/system.mjs";
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
  const run = (args, extra = {}, cwd = undefined) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: { ...env, ...extra } });
  return { home, bin, env, run, calls: () => (existsSync(logFile) ? readFileSync(logFile, "utf8") : "") };
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
  assert.match(cli, /`NoDefaultCurrentDirectoryInExePath=1`[^|]*`init --start`/, "the Windows switch the agent session inherits is written down");
});

// A claude a project could ship: it only records that it ran.
const PLANTED = `#!/usr/bin/env node
require("fs").appendFileSync(process.env.FAKE_LOG, "planted " + process.argv.slice(2).join(" ") + "\\n");
`;

test("#178: update --all never runs a claude from the project, the current folder, a node_modules/.bin or a relative PATH entry", unixOnly, () => {
  const m = machine({ tools: ["claude"], plugins: ["claude"], global: false });
  const root = tmp(), dir = join(root, "app"), cwd = join(root, "here", "sub");
  // npx puts <cwd>/node_modules/.bin and each ancestor's first; the rest are a folder inside the project,
  // a folder inside the current one, one inside the project whose name starts with "..", a link into the project,
  // and a relative entry that points outside both.
  const planted = [join(dir, "node_modules", ".bin"), join(root, "node_modules", ".bin"), join(dir, "tools"), join(cwd, "bin"), join(dir, "..x"), join(root, "here", "rel")];
  for (const d of planted) put(d, "claude", PLANTED), chmodSync(join(d, "claude"), 0o755);
  symlinkSync(join(dir, "tools"), join(root, "link"));
  mkdirSync(cwd, { recursive: true });
  const PATH = [...planted.slice(0, 5), join(root, "link"), join("..", "rel"), m.env.PATH].join(delimiter);
  const plan = m.run(["update", dir, "--all", "--dry-run"], { PATH }, cwd);
  assert.match(plan.stdout, new RegExp(`would run\\n\\s+${esc(join(m.bin, "claude"))} plugin marketplace update onrails`));
  const r = m.run(["update", dir, "--all"], { PATH }, cwd);
  assert.equal(r.status, 0, r.stderr);
  const plugin = m.calls().split("\n").filter((l) => / plugin /.test(l));
  // Only plugin commands: doctor's own `claude --version` probe still uses the bare name (#185).
  assert.deepEqual(plugin, ["claude plugin marketplace update onrails", "claude plugin update core@onrails"]);
});

// A machine whose only claude is in ~/.local/bin, where Claude Code's native installer puts it.
function homeInstall() {
  const m = machine({ tools: [], plugins: ["claude"], global: false });
  const local = join(m.home, ".local", "bin");
  put(local, "claude", CLAUDE), chmodSync(join(local, "claude"), 0o755);
  return { ...m, PATH: [local, dirname(process.execPath)].join(delimiter) };
}
const pluginCalls = (m) => m.calls().split("\n").filter((l) => / plugin /.test(l));
const BOTH = ["claude plugin marketplace update onrails", "claude plugin update core@onrails"];

test("#178: run from the home folder, or given it as the project, update --all still runs the claude in ~/.local/bin", unixOnly, () => {
  let m = homeInstall();
  let r = m.run(["update", "--all"], { PATH: m.PATH }, m.home);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pluginCalls(m), BOTH, r.stdout);
  // The /update skill passes the current folder as the project root when it isn't a project: here, the home folder.
  m = homeInstall();
  r = m.run(["update", m.home, "--all"], { PATH: m.PATH }, tmp());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pluginCalls(m), BOTH, r.stdout);
  // A folder that holds the home folder, and the filesystem root, are never the project either.
  m = homeInstall();
  r = m.run(["update", dirname(m.home), "--all"], { PATH: m.PATH }, "/");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pluginCalls(m), BOTH, r.stdout);
});

test("#178: a claude found only inside the project is named as that, not as missing from PATH, and doesn't run", unixOnly, () => {
  const m = homeInstall(), dir = join(m.home, "work", "app");
  put(join(dir, "tools"), "claude", PLANTED), chmodSync(join(dir, "tools", "claude"), 0o755);
  const r = m.run(["update", dir, "--all"], { PATH: [join(dir, "tools"), dirname(process.execPath)].join(delimiter) }, tmp());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Code plugin core@onrails v0\.6\.0: skipped, claude found only inside this project, not run/);
  assert.doesNotMatch(r.stdout, /isn't on your PATH/);
  assert.deepEqual(pluginCalls(m), []);
});

test("#178: a node_modules/.bin entry written as .bin/. or ./.bin is still skipped", unixOnly, () => {
  const m = machine({ tools: ["claude"], plugins: ["claude"], global: false });
  const root = tmp(), dir = join(root, "app"), up = join(root, "node_modules");
  put(join(up, ".bin"), "claude", PLANTED), chmodSync(join(up, ".bin", "claude"), 0o755);
  mkdirSync(dir, { recursive: true });
  for (const entry of [`${up}/.bin/.`, `${up}/./.bin`]) {
    const r = m.run(["update", dir, "--all"], { PATH: [entry, m.env.PATH].join(delimiter) }, dir);
    assert.equal(r.status, 0, r.stderr);
  }
  // Only plugin commands: doctor's own `claude --version` probe still uses the bare name (#185).
  assert.deepEqual(pluginCalls(m), [...BOTH, ...BOTH], "the ancestor's node_modules/.bin never ran a plugin command");
});

test("#178: on Windows a .cmd shim runs through cmd.exe by its full path, from ComSpec or SystemRoot, never a bare cmd.exe", () => {
  const shim = "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd";
  const argv = [shim, "plugin", "update", "core@onrails"];
  let l = launch(argv, { platform: "win32", env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" } });
  assert.equal(l.file, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(l.args, ["/d", "/s", "/c", `""${shim}" plugin update core@onrails"`]);
  assert.equal(l.verbatim, true);
  assert.equal(l.env.NoDefaultCurrentDirectoryInExePath, "1", "the shim's bare `node` is never looked up in the current folder");
  assert.equal(launch(argv, { platform: "win32", env: { SystemRoot: "D:\\Win" } }).file, "D:\\Win\\System32\\cmd.exe");
  assert.equal(launch(argv, { platform: "win32", env: {} }).file, "C:\\Windows\\System32\\cmd.exe");
  l = launch(["C:\\tools\\codex.exe", "plugin"], { platform: "win32", env: {} });
  assert.deepEqual([l.file, l.args, l.verbatim], ["C:\\tools\\codex.exe", ["plugin"], undefined], "an .exe starts as it is");
  l = launch(["/bin/claude", "plugin"], { platform: "linux", env: { A: "1" } });
  assert.deepEqual(l, { file: "/bin/claude", args: ["plugin"], env: { A: "1" } });
});

test("#178: on Windows a .cmd path with a space reaches cmd.exe as one quoted word, verbatim, as preflight's commandFor does", () => {
  const shim = "C:\\Users\\John Smith\\AppData\\Roaming\\npm\\claude.cmd";
  const env = { ComSpec: "C:\\Windows\\System32\\cmd.exe" };
  const l = launch([shim, "plugin", "marketplace", "update", "onrails"], { platform: "win32", env });
  // cmd.exe /s drops the first and last quote on the line, which leaves "<path>" quoted.
  assert.deepEqual([l.file, l.args, l.verbatim], [env.ComSpec, ["/d", "/s", "/c", `""${shim}" plugin marketplace update onrails"`], true]);
  assert.throws(() => launch([shim, "a&b"], { platform: "win32", env }), /plain words/, "cmd.exe never reads a & or a quote from an argument");
  assert.doesNotMatch(repo("scripts/preflight-sys.mjs"), /windowsArgv/, "preflight's comment no longer names the old route");
});

test("#178: a part that throws is a FAILED row; the other parts, doctor and the summary still run, and the exit is 1", unixOnly, () => {
  // Global skills: ~/.agents is a file, so writing ~/.agents/skills fails.
  const m = machine({ tools: [], plugins: [] }), dir = project();
  put(m.home, ".agents", "not a folder\n");
  let r = m.run(["update", dir, "--all"]);
  assert.equal(r.status, 1);
  let summary = r.stdout.slice(r.stdout.lastIndexOf("Summary"));
  assert.match(summary, /Global entry skills: FAILED: .*(ENOTDIR|EEXIST)/);
  assert.match(summary, new RegExp(`Project kit: v0\\.1\\.0 -> v${esc(version)}`), "the project kit still updates");
  assert.ok(r.stdout.indexOf("Summary") > r.stdout.indexOf("4. doctor"), "doctor ran before the summary");

  // Project kit: its record is broken JSON.
  const broken = tmp();
  put(broken, ".onrails.json", "{ broken");
  r = machine({ tools: [], plugins: [], global: false }).run(["update", broken, "--all"]);
  assert.equal(r.status, 1);
  summary = r.stdout.slice(r.stdout.lastIndexOf("Summary"));
  assert.match(summary, /Project kit: FAILED: .*JSON/);
  assert.match(r.stdout, /4\. doctor/);
});

test("#178: the /update skill runs the CLI from a temp folder, its fallback is the plugin's install record and never the project, and it works without the kit", () => {
  const skill = repo(".agents/skills/update/SKILL.md");
  // mktemp -d alone follows TMPDIR, which a session can point into the project, so the folder is named under /tmp.
  assert.match(skill, /\(cd "\$\(mktemp -d \/tmp\/onrails-update\.XXXXXX\)" && npx --yes onrails@latest update "<project root>" --all --dry-run\)/);
  assert.match(skill, /\(cd "\$\(mktemp -d \/tmp\/onrails-update\.XXXXXX\)" && node "<plugin folder>\/cli\/bin\/cli\.mjs" update "<project root>" --all --dry-run\)/);
  assert.doesNotMatch(skill, /mktemp -d\)/, "no bare mktemp -d");
  assert.match(skill, /PowerShell\)\? Make a new folder under `\$env:TEMP`, or under your home folder when `\$env:TEMP` is inside the project/);
  assert.match(skill, /real path is inside the project\? Make another/);
  assert.match(skill, /`\$\{CLAUDE_PLUGIN_ROOT\}`/);
  assert.match(skill, /the `installPath` of `core@onrails` in `~\/\.claude\/plugins\/installed_plugins\.json`/);
  assert.match(skill, /`~\/\.codex\/plugins\/cache\/onrails\/or\/`/);
  assert.match(skill, /Never use a folder inside the project/);
  assert.doesNotMatch(skill, /two levels above/, "a project's copy would point into the project");
  assert.match(skill, /No plugin installed\? There's no fallback: it's a 🛑 blocker, with this one command .*`npx --yes onrails@latest update "<project root>" --all`/);
  assert.match(skill, /\*\*No kit here\*\* \(no `ask` skill/);
});
