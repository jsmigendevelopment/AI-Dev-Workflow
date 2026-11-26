import { test } from "node:test";
import assert from "node:assert/strict";
import { doctor } from "../src/doctor.mjs";
import { init } from "../src/init.mjs";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fake, logger, put, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { stamp } from "./procs-fake.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const V = version.replaceAll(".", "\\.");

test("doctor in an empty folder reports the missing kit and fails", () => {
  const log = logger();
  assert.equal(doctor(tmp(), { log }), 1);
  assert.match(log.text(), /✗ Kit not installed here/);
  assert.match(log.text(), /fix: Run: npx onrails init/);
});

test("doctor after init checks the kit and the skills mirror", () => {
  const dir = tmp();
  init(dir, { log: logger() });
  const log = logger();
  const code = doctor(dir, { log });
  assert.ok(code === 0 || code === 1);
  assert.match(log.text(), new RegExp(`✓ Kit v${V} installed`));
  assert.match(log.text(), /✓ AGENTS\.md present/);
  assert.match(log.text(), /✓ \.agents\/skills and \.claude\/skills match/);
  assert.match(log.text(), /– No docs\/state\.md yet/);

  put(dir, ".claude/skills/idea/SKILL.md", "drifted\n");
  const drift = logger();
  doctor(dir, { log: drift });
  assert.match(drift.text(), /✗ \.agents\/skills and \.claude\/skills differ/);
});

test("doctor lists stale research dossiers by name, and stays quiet without docs/research", () => {
  const dir = tmp();
  init(dir, { log: logger() });
  const none = logger();
  doctor(dir, { log: none });
  assert.doesNotMatch(none.text(), /research dossier/);

  const header = "| Dossier | Question | Decision | Date | Status | Re-check | Author model · effort |\n|---|---|---|---|---|---|---|\n";
  put(dir, "docs/research/README.md", `${header}| [Old](old.md) | Which? | none yet | 2020-01-01 | current | 2020-06-01 | unknown · unknown |\n`);
  const log = logger();
  doctor(dir, { log });
  assert.match(log.text(), /✗ 1 stale research dossier\(s\): old\.md \(re-check 2020-06-01\)/);
  assert.match(log.text(), /fix: Re-check each with the research skill/);

  put(dir, "docs/research/README.md", header);
  const fresh = logger();
  doctor(dir, { log: fresh });
  assert.match(fresh.text(), /✓ No stale research dossiers/);
});

// #143 item 5: a repo on Full automation that still runs a kit from before the Full override stops for
// gates that Full and the person's decisions lift. doctor says to update.
const FULL = "# Stack\n\n## Automation level\n\n- **Level:** full  <!-- recommended | full | hands-on | custom -->\n";
const RECOMMENDED = "# Stack\n\n## Automation level\n\n- **Level:** recommended\n";
function onKit(kitVersion, stack) {
  const dir = tmp();
  init(dir, { log: logger() });
  const manifest = JSON.parse(readFileSync(join(dir, ".onrails.json"), "utf8"));
  put(dir, ".onrails.json", JSON.stringify({ ...manifest, kitVersion }));
  put(dir, "docs/stack.md", stack);
  const log = logger();
  doctor(dir, { log });
  return log.text();
}

test("AC-143-4: WHEN doctor runs in a repo on Full with a kit older than 0.7.0 THEN it says to update", () => {
  const text = onKit("0.5.3", FULL);
  assert.match(text, /✗ Full automation on kit v0\.5\.3: kits before v0\.7\.0 still stop for gates that Full and your decisions lift/);
  assert.match(text, /fix: Run: npx onrails@latest update/);
});

test("AC-143-4: doctor stays quiet about it on Recommended, or on Full with kit 0.7.0 or newer", () => {
  assert.doesNotMatch(onKit("0.5.3", RECOMMENDED), /Full automation on kit/);
  assert.doesNotMatch(onKit("0.7.0", FULL), /Full automation on kit/);
  assert.doesNotMatch(onKit("0.10.0", FULL), /Full automation on kit/);
});

// #185: doctor runs each tool only by a full path it found itself, with the same PATH search as update --all, so a
// tool the project ships never runs. Each fake records its runs in FAKE_LOG under its own label.
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const TOOL = (label) => `#!/usr/bin/env node
require("fs").appendFileSync(process.env.FAKE_LOG, ${JSON.stringify(label)} + " " + process.argv.slice(2).join(" ") + "\\n");
console.log("9.9.9");
`;

// Runs `doctor dir` as a child in cwd, with `bins` first on a safe PATH. Returns its output and the fakes' runs.
// fill(home), when given, puts files in the child's temp HOME first.
function doctorChild(dir, { bins, cwd = dir, fill }) {
  const log = join(tmp("onrails-log-"), "calls.log");
  const home = tmp("onrails-home-");
  fill?.(home);
  const env = safeEnv({ FAKE_LOG: log, HOME: home, USERPROFILE: home }, { bins, cwd });
  const r = spawnSync(process.execPath, [CLI, "doctor", dir], { cwd, env, encoding: "utf8" });
  return { stdout: r.stdout, calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

test("AC-185-1: WHEN a fake claude sits in <project>/node_modules/.bin first on PATH and doctor runs in the project THEN the fake never runs", unixOnly, () => {
  const dir = tmp(), outside = tmp("onrails-bin-"), projectBin = join(dir, "node_modules", ".bin");
  fake(projectBin, "claude", TOOL("planted"));
  fake(outside, "claude", TOOL("outside"));
  const r = doctorChild(dir, { bins: [projectBin, outside] });
  assert.doesNotMatch(r.calls, /^planted/m, r.calls);
  // The claude outside the project still answers, run by its full path.
  assert.match(r.calls, /^outside --version$/m);
  assert.match(r.stdout, /✓ Claude Code 9\.9\.9/);
});

test("AC-185-2: WHEN PATH has a relative entry with a planted tool THEN doctor never runs it", unixOnly, () => {
  // The entry points outside both the project and the current folder, so only its being relative keeps it out.
  const root = tmp(), dir = join(root, "app"), cwd = join(root, "here", "sub");
  mkdirSync(dir, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  fake(join(root, "here", "rel"), "claude", TOOL("planted"));
  fake(join(root, "here", "rel"), "codex", TOOL("planted"));
  const r = doctorChild(dir, { bins: [join("..", "rel")], cwd });
  assert.equal(r.calls, "");
  assert.match(r.stdout, /✗ Neither Claude Code nor Codex found/);
});

test("#185: doctor never runs the wrangler a project ships, and says how to check the sign-in by hand", unixOnly, () => {
  const dir = tmp();
  put(dir, "wrangler.jsonc", "{}");
  put(dir, "package.json", JSON.stringify({ devDependencies: { wrangler: "4.0.0" } }));
  fake(join(dir, "node_modules", ".bin"), "wrangler", TOOL("planted"));
  const r = doctorChild(dir, { bins: [] });
  assert.equal(r.calls, "");
  assert.match(r.stdout, /– wrangler sign-in not checked \(doctor runs no wrangler from inside the project\)\. Check it yourself: pnpm exec wrangler whoami/);
});

// What the real system's exec(["fix-tool-185", "enable"]) answers, run in a child with `bins` first on a safe PATH.
const SYSTEM = new URL("../src/system.mjs", import.meta.url).href;
function execIn(dir, bins, log) {
  const code = `import { realSystem } from ${JSON.stringify(SYSTEM)};
process.stderr.write(String(realSystem({ projectDir: ${JSON.stringify(dir)} }).exec(["fix-tool-185", "enable"])));`;
  const env = safeEnv({ FAKE_LOG: log }, { bins });
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: dir, env, encoding: "utf8" }).stderr;
}

test("#185: a fix command runs only by the full path the PATH search found, never one the project ships", unixOnly, () => {
  const dir = tmp(), outside = tmp("onrails-bin-"), log = join(tmp("onrails-log-"), "calls.log");
  const projectBin = join(dir, "node_modules", ".bin");
  fake(projectBin, "fix-tool-185", TOOL("planted"));
  assert.equal(execIn(dir, [projectBin], log), "false", "only the project has one");
  fake(outside, "fix-tool-185", TOOL("outside"));
  assert.equal(execIn(dir, [projectBin, outside], log), "true");
  assert.equal(readFileSync(log, "utf8"), "outside enable\n");
});

// #185 round 1: the process check's git and ps (procs-sys.mjs) go through the same PATH search. The pair outside the
// project answers: git says "not a repo", so the home registry is read, and its one record makes the check ask ps
// about PIDs 4000 and 600. git logs the folder it ran in: since #215 it gets the project as its cwd, not -C.
const OUTSIDE = (name) => `#!/usr/bin/env node
const args = process.argv.slice(2);
const at = ${name === "git" ? '" @ " + process.cwd()' : '""'};
require("fs").appendFileSync(process.env.FAKE_LOG, "outside-${name} " + args.join(" ") + at + "\\n");
if (args[0] === "--version") console.log("${name} version 9.9.9");
process.exitCode = ${name === "git" ? 'args[0] === "--version" ? 0 : 1' : "0"};
`;
function homeRecord(home) {
  put(home, ".onrails/procs.json", JSON.stringify({ version: 1, procs: [{ id: "pold1", kind: "process", pid: 4000, group: true,
    start: "start-4000", command: "pnpm dev", why: "w", until: "u", deadline: null, state: "running", pausedUntil: null, label: "other",
    startedAt: "2026-01-01T00:00:00Z", session: "s-old", agent: { pid: 600, start: "start-600" } }] }));
  stamp(join(home, ".onrails", "procs.json")); // a session wrote it (#174)
  chmodSync(join(home, ".onrails"), 0o700);
  chmodSync(join(home, ".onrails", "procs.json"), 0o600);
}

test("AC-185-1: WHEN a planted git and ps sit in <project>/node_modules/.bin first on PATH THEN doctor's process check never runs them, and the git and ps outside the project answer", unixOnly, () => {
  const dir = tmp(), outside = tmp("onrails-bin-"), projectBin = join(dir, "node_modules", ".bin");
  for (const name of ["git", "ps"]) {
    fake(projectBin, name, TOOL("planted"));
    fake(outside, name, OUTSIDE(name));
  }
  const r = doctorChild(dir, { bins: [projectBin, outside], fill: homeRecord });
  assert.doesNotMatch(r.calls, /^planted/m, r.calls);
  assert.ok(r.calls.split("\n").includes(`outside-git rev-parse --git-common-dir @ ${realpathSync(dir)}`), r.calls);
  assert.match(r.calls, /^outside-ps .* -p 4000,600$/m, r.calls);
});

test("#185 round 1: WHEN a tool is found only where doctor won't run it THEN doctor says where, as update --all does", unixOnly, () => {
  const dir = tmp(), projectBin = join(dir, "node_modules", ".bin");
  fake(projectBin, "claude", TOOL("planted"));
  const r = doctorChild(dir, { bins: [projectBin] });
  assert.equal(r.calls, "");
  assert.match(r.stdout, /✗ Neither Claude Code nor Codex found \(claude found only in a node_modules\/\.bin, not run\)\n/);
});

// The first command pnpmPlan picks on the real system, in a child with `bins` first on a safe PATH.
const INSTALLERS = new URL("../src/installers.mjs", import.meta.url).href;
function pnpmFirst(dir, bins) {
  const code = `import { realSystem } from ${JSON.stringify(SYSTEM)}; import { pnpmPlan } from ${JSON.stringify(INSTALLERS)};
process.stderr.write(pnpmPlan(realSystem({ projectDir: ${JSON.stringify(dir)} })).run[0].join(" "));`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: dir, env: safeEnv({}, { bins }), encoding: "utf8" }).stderr;
}

test("#185 round 1: doctor --fix plans with the PATH search exec runs, so a corepack only the project ships counts as missing", unixOnly, () => {
  const dir = tmp(), outside = tmp("onrails-bin-"), projectBin = join(dir, "node_modules", ".bin");
  fake(projectBin, "corepack", TOOL("planted"));
  assert.equal(pnpmFirst(dir, [projectBin]), "npm install -g corepack");
  fake(outside, "corepack", TOOL("outside"));
  assert.equal(pnpmFirst(dir, [projectBin, outside]), "corepack enable");
});
