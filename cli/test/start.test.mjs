import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_MANIFEST } from "../src/kit.mjs";
import { entryCommand, offerStart } from "../src/start.mjs";
import { findCommand } from "../src/system.mjs";
import { exists, fakeAsk, fakeSystem, logger, put, tmp } from "./helpers.mjs";

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
  put(bin, "claude", `#!/bin/sh\nprintf '%s\\n' "$PWD" "$@" > "${out}"\n`);
  chmodSync(join(bin, "claude"), 0o755);
  const dir = tmp();
  put(dir, "src/main.py", "print(1)\n");
  const r = spawnSync(process.execPath, [CLI, "init", dir, "--start"], { encoding: "utf8", env: { ...process.env, PATH: bin } });
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
  put(bin, "claude", `#!/bin/sh\necho ran > "${out}"\n`);
  chmodSync(join(bin, "claude"), 0o755);
  const dir = tmp();
  const r = spawnSync(process.execPath, [CLI, "init", dir], { encoding: "utf8", env: { ...process.env, PATH: bin } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Open this folder there, start a new session and type \/idea/);
  assert.ok(!exists(out, ""), "the fake agent never ran");
  assert.equal(spawnSync(process.execPath, [CLI, "init", tmp(), "--start", "--no-start"]).status, 2);
});
