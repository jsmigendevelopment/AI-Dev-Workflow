import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_MANIFEST } from "../src/kit.mjs";
import { entryCommand, offerStart } from "../src/start.mjs";
import { findCommand, realSystem } from "../src/system.mjs";
import { checkPath, exists, fake, fakeAsk, fakeSystem, logger, put, safeEnv, tmp } from "./helpers.mjs";

// A fake world where spawnInteractive records what would have started. No agent ever runs.
function world(commands) {
  const sys = fakeSystem({ commands });
  sys.started = [];
  sys.spawnInteractive = (argv, { cwd }) => (sys.started.push({ argv, cwd }), 0);
  return sys;
}

test("entryCommand: empty or README-only folders are new apps, anything else is existing code", () => {
  const dir = tmp();
  assert.equal(entryCommand(dir), "idea");
  assert.equal(entryCommand(join(dir, "not-yet-made")), "idea");
  for (const name of [".git/HEAD", "README.md", "LICENSE", ".gitignore", ".DS_Store", ".vscode/settings.json"]) put(dir, name, "x");
  assert.equal(entryCommand(dir), "idea");
  put(dir, "package.json", "{}");
  assert.equal(entryCommand(dir), "join");
  const other = tmp();
  put(other, "AGENTS.md", "# ours\n");
  assert.equal(entryCommand(other), "join");
});

test("offerStart asks once and starts Claude Code with /idea on yes (Enter)", async () => {
  const sys = world(["claude"]);
  const ask = fakeAsk([""]);
  ask.close = () => (ask.closed = true);
  const log = logger();
  assert.equal(await offerStart("/p", "idea", { sys, ask, interactive: true, log }), 0);
  assert.deepEqual(ask.questions, ["Start Claude Code here now with /idea? (Y/n) "]);
  assert.deepEqual(sys.started, [{ argv: ["claude", "/idea"], cwd: "/p" }]);
  assert.ok(ask.closed, "the readline is closed before the agent takes the terminal");
  assert.match(log.text(), /Starting Claude Code: claude \/idea/);
});

test("offerStart: no means no, and prints the desktop line", async () => {
  const sys = world(["claude"]);
  const log = logger();
  await offerStart("/p", "join", { sys, ask: fakeAsk(["n"]), interactive: true, log });
  assert.deepEqual(sys.started, []);
  assert.match(log.text(), /desktop app or an IDE\? Open this folder there, start a new session and type \/join/);
});

test("offerStart: Codex alone gets $join", async () => {
  const sys = world(["codex"]);
  await offerStart("/p", "join", { sys, ask: fakeAsk(["y"]), interactive: true, log: logger() });
  assert.deepEqual(sys.started[0].argv, ["codex", "$join"]);
});

test("offerStart: both installed asks which, re-asks on nonsense, defaults to claude", async () => {
  const sys = world(["claude", "codex"]);
  const ask = fakeAsk(["what", "codex"]);
  await offerStart("/p", "idea", { sys, ask, interactive: true, log: logger() });
  assert.equal(ask.questions.length, 2);
  assert.match(ask.questions[0], /Claude Code \(\/idea\) or Codex \(\$idea\).*\(claude\/codex\/n\) \[claude\]/);
  assert.deepEqual(sys.started[0].argv, ["codex", "$idea"]);

  const again = world(["claude", "codex"]);
  await offerStart("/p", "idea", { sys: again, ask: fakeAsk([""]), interactive: true, log: logger() });
  assert.deepEqual(again.started[0].argv, ["claude", "/idea"]);
});

test("offerStart never asks or starts without a terminal, in CI or with --no-start", async () => {
  for (const opts of [{ interactive: false }, { interactive: true, start: false }]) {
    const sys = world(["claude", "codex"]);
    const ask = fakeAsk(["y"]);
    const log = logger();
    await offerStart("/p", "idea", { sys, ask, log, ...opts });
    assert.deepEqual(ask.questions, []);
    assert.deepEqual(sys.started, []);
    assert.match(log.text(), /Open this folder there/);
  }
});

test("offerStart --start starts with no question, even without a terminal; no agent prints a hint", async () => {
  const sys = world(["codex"]);
  const ask = fakeAsk();
  await offerStart("/p", "idea", { sys, ask, start: true, interactive: false, log: logger() });
  assert.deepEqual(ask.questions, []);
  assert.deepEqual(sys.started[0].argv, ["codex", "$idea"]);

  const none = world([]);
  const log = logger();
  await offerStart("/p", "idea", { sys: none, ask, start: true, interactive: true, log });
  assert.deepEqual(none.started, []);
  assert.match(log.text(), /not found on your PATH/);
});

test("findCommand reads a fake PATH, with PATHEXT on Windows", () => {
  const bin = tmp();
  put(bin, "claude", "");
  put(bin, "codex.CMD", ""); // Windows matches PATHEXT case-insensitively; this test runs on any OS
  assert.equal(findCommand("claude", { env: { PATH: bin }, platform: "linux" }), join(bin, "claude"));
  assert.equal(findCommand("codex", { env: { PATH: bin }, platform: "linux" }), null);
  assert.equal(findCommand("codex", { env: { Path: bin, PATHEXT: ".EXE;.CMD" }, platform: "win32" }), join(bin, "codex.CMD"));
  assert.equal(findCommand("claude", { env: { PATH: tmp() }, platform: "linux" }), null);
});

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

test("init --start through the binary runs the fake claude on PATH in the project folder", { skip: process.platform === "win32" }, () => {
  const bin = tmp();
  const out = join(tmp(), "ran.txt");
  fake(bin, "claude", `#!/bin/sh\nprintf '%s\\n' "$PWD" "$@" > "${out}"\n`);
  const dir = tmp();
  put(dir, "src/main.py", "print(1)\n");
  const r = spawnSync(process.execPath, [CLI, "init", dir, "--start"], { encoding: "utf8", env: safeEnv({ PATH: bin }) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(exists(dir, PROJECT_MANIFEST));
  assert.match(r.stdout, /Starting Claude Code: claude \/join/);
  const [cwd, ...args] = readFileSync(out, "utf8").trim().split("\n");
  assert.equal(realpathSync(cwd), realpathSync(dir));
  assert.deepEqual(args, ["/join"]);
});

test("init through the binary without a terminal never starts an agent", { skip: process.platform === "win32" }, () => {
  const bin = tmp();
  const out = join(tmp(), "ran.txt");
  fake(bin, "claude", `#!/bin/sh\necho ran > "${out}"\n`);
  const dir = tmp();
  const r = spawnSync(process.execPath, [CLI, "init", dir], { encoding: "utf8", env: safeEnv({ PATH: bin }) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Open this folder there, start a new session and type \/idea/);
  assert.ok(!exists(out, ""), "the fake agent never ran");
  assert.equal(spawnSync(process.execPath, [CLI, "init", tmp(), "--start", "--no-start"], { env: safeEnv() }).status, 2);
});

// #215: init --start finds the agent with toolPath, the search doctor and update --all use, and starts it by that
// full path through launch. run is a recording spawnSync: no agent, fake or real, starts in these in-process tests.
function recorder() {
  const calls = [];
  const run = (file, args, opts) => (calls.push({ argv: [file, ...args], cwd: opts?.cwd }), { status: 0 });
  return { calls, run };
}

test("AC-215-1: WHEN a fake claude sits in <project>/node_modules/.bin first on PATH and init --start runs there THEN the fake never runs", async () => {
  const project = tmp(), installed = tmp("onrails-installed-");
  put(project, "node_modules/.bin/claude", "the project's copy\n");
  put(installed, "claude", "the person's claude\n");
  const env = { PATH: [join(project, "node_modules/.bin"), installed].join(delimiter) };
  const { calls, run } = recorder();
  const sys = realSystem({ projectDir: project, platform: "linux", env, run });
  assert.equal(await offerStart(project, "idea", { sys, start: true, interactive: false, log: logger() }), 0);
  assert.deepEqual(calls, [{ argv: [join(installed, "claude"), "/idea"], cwd: project }], "started by the full path the search found");
});

test("AC-215-1: on Windows, a claude.cmd in <project>/node_modules/.bin never runs; the person's claude.cmd starts through cmd.exe from ComSpec", async () => {
  const project = tmp(), installed = tmp("onrails-installed-");
  const ComSpec = "C:\\Windows\\System32\\cmd.exe";
  put(project, "node_modules/.bin/claude.cmd", "the project's copy\n");
  for (const name of ["claude", "claude.cmd", "claude.ps1"]) put(installed, name, "npm's shim\n");
  const env = { PATH: [join(project, "node_modules/.bin"), installed].join(delimiter), PATHEXT: ".com;.exe;.bat;.cmd", ComSpec };
  const { calls, run } = recorder();
  const sys = realSystem({ projectDir: project, platform: "win32", env, run });
  await offerStart(project, "idea", { sys, start: true, interactive: false, log: logger() });
  assert.deepEqual(calls.map((c) => c.argv), [[ComSpec, "/d", "/s", "/c", `""${join(installed, "claude.cmd")}" /idea"`]]);
});

test("AC-215-1: WHEN the only claude on PATH is in a folder inside the project THEN init --start through the binary says it wasn't found and it never runs", { skip: process.platform === "win32" }, () => {
  const project = tmp(), elsewhere = tmp();
  const out = join(tmp(), "ran.txt");
  fake(join(project, "tools"), "claude", `#!/bin/sh\necho ran > "${out}"\n`);
  // Run from another folder, so only the project init is given can make the search skip <project>/tools.
  const env = safeEnv({}, { bins: [join(project, "tools")] });
  const r = spawnSync(process.execPath, [CLI, "init", project, "--start"], { cwd: elsewhere, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Code and Codex were not found on your PATH/);
  assert.ok(!exists(out, ""), "the project's claude never ran");
});

test("AC-215-2: WHEN the only claude on PATH is in a relative entry THEN init says Claude Code wasn't found and starts nothing", async () => {
  const cwd = tmp();
  put(cwd, "rel-bin/claude", "a copy found through a relative PATH entry\n");
  const { calls, run } = recorder();
  const log = logger();
  const sys = realSystem({ projectDir: tmp(), platform: "linux", env: { PATH: "rel-bin" }, run });
  const here = process.cwd();
  process.chdir(cwd);
  try {
    await offerStart(tmp(), "idea", { sys, start: true, interactive: false, log });
  } finally {
    process.chdir(here);
  }
  assert.match(log.text(), /Claude Code and Codex were not found on your PATH/);
  assert.deepEqual(calls, []);
});

test("AC-215-2: through the binary, a claude only in a relative PATH entry is not found and never runs", { skip: process.platform === "win32" }, () => {
  const cwd = tmp();
  const out = join(tmp(), "ran.txt");
  fake(join(cwd, "rel-bin"), "claude", `#!/bin/sh\necho ran > "${out}"\n`);
  const env = checkPath({ ...safeEnv(), PATH: `rel-bin${delimiter}${safeEnv().PATH}` }, cwd);
  const r = spawnSync(process.execPath, [CLI, "init", tmp(), "--start"], { cwd, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Code and Codex were not found on your PATH/);
  assert.ok(!exists(out, ""), "the relative entry's claude never ran");
});

test("#215: spawnInteractive refuses a name the search won't start, and starts nothing", () => {
  const project = tmp();
  put(project, "node_modules/.bin/claude", "the project's copy\n");
  const { calls, run } = recorder();
  const sys = realSystem({ projectDir: project, platform: "linux", env: { PATH: join(project, "node_modules/.bin") }, run });
  assert.throws(() => sys.spawnInteractive(["claude", "/idea"], { cwd: project }), /Could not start claude: claude found only in a node_modules\/\.bin, not run/);
  assert.deepEqual(calls, []);
});
