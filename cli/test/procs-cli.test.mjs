// Tests for the process registry's outside edges (#126): the CLI binary, one real child it owns,
// the session hooks' wiring, doctor, the skills that use it, and the size of these test files (#156).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "../src/procs-store.mjs";
import { processChecks } from "../src/project-checks.mjs";
import { tmp } from "./helpers.mjs";
import { SCRIPT, fakeSys, repoFile, seed } from "./procs-fake.mjs";

const TESTS = fileURLToPath(new URL(".", import.meta.url));
const BEFORE = 31; // tests in procs.test.mjs on main before #156 split it

test("AC-156-5: WHEN the tests run THEN no test file of procs is over 300 lines and the test count is not lower", () => {
  const files = readdirSync(TESTS).filter((f) => /^procs.*\.test\.mjs$/.test(f));
  let count = 0;
  for (const f of files) {
    const text = readFileSync(`${TESTS}/${f}`, "utf8");
    assert.ok(text.split("\n").length <= 300, `${f} is over 300 lines`);
    count += (text.match(/^test\(/gm) ?? []).length;
  }
  assert.ok(count > BEFORE, `${count} tests; there were ${BEFORE}, plus this one`);
});

test("AC-2 and AC-2b: ask's Pause and stop names the resume note, timer.mjs status and the list; qa starts its server through the registry", () => {
  const ask = repoFile(".agents/skills/ask/SKILL.md").split("## Pause and stop")[1].split("\n## ")[0];
  for (const words of ["resume note", "timer.mjs status", "P list --mine", "P stop mine", "P pause"]) assert.ok(ask.includes(words), words);
  const qa = repoFile(".agents/skills/qa/SKILL.md");
  assert.match(qa, /procs\.mjs start --why .* --until .* -- /);
  assert.match(qa, /procs\.mjs stop <id>/);
});

test("doctor warns about stale processes, with the command that stops them", () => {
  const sys = fakeSys({ procs: { 4000: {} } });
  assert.deepEqual(processChecks(sys.cwd, { sys }), []);
  seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev" });
  const [check] = processChecks(sys.cwd, { sys });
  assert.equal(check.status, "✗");
  assert.equal(check.required, false);
  assert.match(check.label, /1 stale background process\(es\): pold1 pnpm dev \(its owner session is gone\)/);
  assert.equal(check.fix, "Run: npx onrails ps --stop stale");
});

test("both tools' session hooks run the registry: Claude Code and Codex end, and the start hook reads it", () => {
  const claude = JSON.parse(repoFile(".claude/settings.json")).hooks.SessionEnd.flatMap((g) => g.hooks);
  const codex = JSON.parse(repoFile(".codex/hooks.json")).hooks.SessionEnd.flatMap((g) => g.hooks);
  for (const hooks of [claude, codex]) assert.ok(hooks.some((h) => /\.agents\/skills\/ask\/scripts\/procs\.mjs" session-end$/.test(h.command)));
  assert.ok(codex.every((h) => h.timeout <= 3), "Codex caps SessionEnd hooks at 3 seconds");
  assert.match(repoFile(".claude/hooks/session-start.mjs"), /procs\.mjs.*session-start/s);
});

test("npx onrails ps through the binary: --help lists it, an empty registry says so, and a PID it didn't start is refused", () => {
  const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
  const home = tmp("procs-cli-home-");
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, SystemRoot: process.env.SystemRoot };
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: tmp("procs-cli-cwd-"), env, encoding: "utf8", input: "" });
  assert.match(cli("--help").stdout, /ps \[dir\] --stop <id\|all\|stale\|pid> \[--yes\]/);
  const empty = cli("ps");
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(empty.stdout.trim(), "Nothing registered is running.");
  const refused = cli("ps", "--stop", String(process.pid));
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /isn't in the registry: onRails didn't start it\. Stop it anyway\? \[y\/N\]/);
  assert.equal(cli("ps", "--nope").status, 2);
});

test("the one real process: start a harmless child, see it listed, stop it, and nothing of it is left", () => {
  const home = tmp("procs-real-home-"), cwd = tmp("procs-real-cwd-");
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, SystemRoot: process.env.SystemRoot, ONRAILS_THREAD: "real-test" };
  const script = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: "utf8", timeout: 30_000 });
  const started = script("start", "--why", "the real test", "--until", "this test ends", "--", process.execPath, "-e", "setInterval(() => {}, 1000)");
  assert.equal(started.status, 0, started.stdout + started.stderr);
  const id = started.stdout.split(" ")[0];
  const { pid } = load(join(home, ".onrails", "procs.json"))[0];
  const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    assert.ok(alive());
    assert.match(script("list").stdout, new RegExp(`${id} · running · pid ${pid}`));
    const stopped = script("stop", id);
    assert.equal(stopped.status, 0, stopped.stdout + stopped.stderr);
    assert.match(stopped.stdout, /Stopped p[0-9a-f]{4}/);
    assert.match(script("list").stdout, /Nothing registered is running\./);
  } finally {
    if (alive()) process.kill(pid, "SIGKILL"); // never leave it behind, even when an assertion fails
  }
});
