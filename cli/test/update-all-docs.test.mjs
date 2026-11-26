// #178: the /update skill, the README, cli/CLI.md and the guards on the `update --all` tests. Nothing here runs
// the CLI, so the guard below can leave this file out of its scan: its samples hold the very forms it looks for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { repo } from "./update-all-helpers.mjs";

const TESTS = fileURLToPath(new URL(".", import.meta.url));
const SELF = basename(fileURLToPath(import.meta.url));

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

test("#178: the /update skill says a skipped tool's by-hand command is for the person, and the agent never runs it", () => {
  const skill = repo(".agents/skills/update/SKILL.md");
  assert.match(skill, /A tool was skipped with a by-hand command\? That command is for the person\. Show it, and never run it yourself/);
});

// Starting Node by its full path (spawnSync) and linking it into a temp folder (symlinkSync) never put its folder
// on PATH. Every other use of Node's path, and the shell's own PATH or env, can. "exec[P]ath" keeps these patterns
// from matching their own source.
const ALLOWED = /\b(?:spawnSync|spawn|symlinkSync)\(\s*process\.exec[P]ath\s*,/g;
const LEAKS = [/exec[P]ath/, /process\.env\.PATH\b/, /\.\.\.\s*process\.env\b/, /process\.argv(?:0\b|\[0\])/];
const runsAll = (text) => /\bupdate\b/.test(text) && /--all\b/.test(text);
const leaks = (text) => runsAll(text) && LEAKS.some((re) => re.test(text.replace(ALLOWED, "")));

test("#178: no CLI test that runs update --all puts Node's own folder on a child's PATH, where an npm-installed claude or codex sits", () => {
  const run = String.raw`spawnSync(process.execPath, [CLI, "update", dir, "--all"], { env });`;
  const forms = [
    String.raw`const env = { PATH: dirname(process.execPath) };`,
    String.raw`const env = { PATH: path.dirname(execPath) };`,
    String.raw`const env = { HOME: h, PATH: process.env.PATH };`,
    String.raw`const env = { ...process.env, HOME: h };`,
    String.raw`const env = { PATH: dirname(realpathSync(process.execPath)) };`,
    String.raw`const nodeDir = process.execPath.replace(/\/node$/, ""); const env = { PATH: nodeDir };`,
    String.raw`const env = { PATH: dirname(process.argv[0]) };`,
  ];
  for (const form of forms) assert.ok(leaks(`${form}\n${run}`), form);
  assert.ok(leaks(String.raw`spawnSync(process.execPath, [CLI, ${"`update`"}, dir, ${"`--all`"}], { env: { PATH: process.env.PATH } });`), "--all in backticks");
  assert.ok(!leaks(String.raw`symlinkSync(process.execPath, join(bin, "node"));` + `\nconst env = { PATH: bin };\n${run}`), "a temp folder with a link to node");
  const bad = readdirSync(TESTS).filter((f) => f.endsWith(".mjs") && f !== SELF).filter((f) => leaks(readFileSync(join(TESTS, f), "utf8")));
  assert.deepEqual(bad, [], "give each child a temp folder with only a link to node and its fakes");
});

test("#178: the split update --all test files keep every test title from before the split, each once", () => {
  const titles = readdirSync(TESTS).filter((f) => /^update-all(-[a-z]+)?\.test\.mjs$/.test(f))
    .flatMap((f) => [...readFileSync(join(TESTS, f), "utf8").matchAll(/^test\("((?:[^"\\]|\\.)*)"/gm)].map((m) => m[1]));
  const before = [
    "AC-178-1: WHEN update --all --dry-run runs with both plugins and global skills THEN it prints the plan for all four parts and runs nothing",
    "AC-178-2: WHEN update --all runs THEN it updates both plugins, refreshes global skills and the project kit, runs doctor and prints before and after",
    "AC-178-3: WHEN update --all runs outside a project THEN it skips the project step and says so",
    "#178: a tool runs only when it and its plugin are both there; a failed command is reported, the rest still runs, and the exit is 1",
    "#178: plain update still updates only the project, and never calls a plugin tool",
    "AC-178-4: WHEN the plugin is read THEN it has an /update skill that runs update --all, ends on /reload-plugins, and on Full asks nothing",
    "AC-178-5: WHEN the README and cli/CLI.md are read THEN they name /update and update --all, and the by-hand line points to them",
    "#178: update --all never runs a claude from the project, the current folder, a node_modules/.bin or a relative PATH entry",
    "#178: run from the home folder, or given it as the project, update --all still runs the claude in ~/.local/bin",
    "#178: a claude found only inside the project is named as that, not as missing from PATH, and doesn't run",
    "#178: a node_modules/.bin entry written as .bin/. or ./.bin is still skipped",
    "#178: on Windows a .cmd shim runs through cmd.exe by its full path, from ComSpec or SystemRoot, never a bare cmd.exe",
    "#178: on Windows a .cmd path with a space reaches cmd.exe as one quoted word, verbatim, as preflight's commandFor does",
    "#178: a part that throws is a FAILED row; the other parts, doctor and the summary still run, and the exit is 1",
    "#178: the /update skill runs the CLI from a temp folder, its fallback is the plugin's install record and never the project, and it works without the kit",
    "#178: no CLI test that runs update --all puts Node's own folder on a child's PATH, where an npm-installed claude or codex sits",
    "#178: a project that holds the home folder stays a root, so a claude it ships never runs",
    "#178: when the home folder is itself an onRails project, its claude is skipped and the message says how to run it by hand",
    "#178: on Windows a .cmd path with a % never reaches cmd.exe, which expands it even inside quotes",
  ];
  for (const title of before) assert.equal(titles.filter((t) => t === title).length, 1, title);
  assert.equal(new Set(titles).size, titles.length, "no title twice");
});
