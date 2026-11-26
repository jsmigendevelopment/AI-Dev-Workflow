// Tests for the process registry's outside edges (#126): the CLI binary, one real child it owns,
// the session hooks' wiring, doctor, the skills that use it, and the size of these test files (#156).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "../src/procs-store.mjs";
import { processChecks } from "../src/project-checks.mjs";
import { safePath, tmp } from "./helpers.mjs";
import { SCRIPT, fakeSys, repoFile, seed } from "./procs-fake.mjs";

const TESTS = fileURLToPath(new URL(".", import.meta.url));
// The 31 tests in procs.test.mjs on main before #156 split it, by title: each must still be there.
const BEFORE = [
  "AC-1: WHEN an agent starts a dev server THEN it's in the registry, with its owner and a stop condition",
  "AC-1: starting one without a reason or a stop condition isn't allowed, and nothing starts",
  "AC-1: in a repo the registry is the main checkout's .onrails/procs.json, shared by worktrees, and it ignores itself",
  "AC-1: --for sets a deadline and starts the watcher, which stops it once the time has passed",
  "AC-2: WHEN the person says stop THEN stop mine ends this session's processes and the list it shows is empty",
  "AC-2b: WHEN the person says pause THEN this session's processes stay, marked paused, and stop once the pause limit passes",
  "AC-2b: the pause limit comes from [workflow] pause_hours, and resume clears the pause",
  "AC-3: WHEN a session ends THEN the hook stops its processes and orphans, TERM then KILL, and a later session finds no orphans",
  "AC-4: WHEN onrails ps finds a process whose owner session is gone THEN it's flagged stale, and --stop stale stops it",
  "AC-4: the session-start hook warns about orphans and names the command that stops them",
  "AC-5: WHEN a process wasn't registered by onRails THEN ps --stop asks before touching it",
  "a recorded PID that now belongs to another process is never signalled",
  "a record with no start time is never alive and never signalled, by stop, the watcher or the session-end hook",
  "start doesn't record a process whose start time can't be read: it stops it through its own handle and says so",
  "refusal: PID 1, 0, negatives, non-integers, ours, a missing or changed start time and a group it doesn't lead are all refused",
  "a registry record {pid: 1, group: true, start: null} with a dead agent gets no signal from session-end, stop stale or ps",
  "stop <pid> after a yes still never signals PID 1, this script, its parent or the agent",
  "AC-5: off the CLI, stop all or stop <id> of another live session is refused without --yes",
  "a registry git tracks came with a branch: it is never read, signalled from or written",
  "symlinks: a linked registry folder, file or logs folder is refused, and a linked .gitignore is replaced, never followed",
  "a group whose leader exits on TERM still gets KILL while a member is left",
  "list, ps and doctor write nothing; stop drops the records of processes that have exited",
  "the session-end hook stops the watcher too, the registry's only timer",
  "AC-2 and AC-2b: ask's Pause and stop names the resume note, timer.mjs status and the list; qa starts its server through the registry",
  "a process that doesn't lead its own group: TERM goes to it and each of its children",
  "Windows: stop runs taskkill /T for the tree, then /T /F after the grace",
  "the agent is the claude or codex program, never a path in a shell's command line",
  "doctor warns about stale processes, with the command that stops them",
  "both tools' session hooks run the registry: Claude Code and Codex end, and the start hook reads it",
  "npx onrails ps through the binary: --help lists it, an empty registry says so, and a PID it didn't start is refused",
  "the one real process: start a harmless child, see it listed, stop it, and nothing of it is left",
];

test("AC-156-5: WHEN the tests run THEN no test file of procs is over 300 lines and every test from before the split is still there", () => {
  const files = readdirSync(TESTS).filter((f) => /^procs.*\.test\.mjs$/.test(f));
  const titles = [];
  for (const f of files) {
    const text = readFileSync(`${TESTS}/${f}`, "utf8");
    assert.ok(text.split("\n").length <= 300, `${f} is over 300 lines`);
    titles.push(...[...text.matchAll(/^test\("((?:[^"\\]|\\.)*)"/gm)].map((m) => JSON.parse(`"${m[1]}"`)));
  }
  assert.equal(BEFORE.length, 31);
  for (const title of BEFORE) assert.equal(titles.filter((t) => t === title).length, 1, `missing or doubled: ${title}`);
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

test("AC-156-4: doctor names a registry skipped for a mode chmod fixes, with that chmod line, as list does", (t) => {
  if (process.platform === "win32") return t.skip("Windows has no POSIX mode");
  const sys = fakeSys({ procs: { 4000: {} } });
  seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev" });
  const path = join(sys.home, ".onrails", "procs.json");
  chmodSync(path, 0o664);
  assert.deepEqual(processChecks(sys.cwd, { sys }), [{
    status: "✗", required: false, label: `Process registry not read: ${path} can be written by other users: run chmod 600 ${path}, which keeps what's in it`,
    fix: "Run that chmod: it keeps the records, and its processes are listed and stopped again",
  }]);
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
  const env = { PATH: safePath(), HOME: home, USERPROFILE: home, SystemRoot: process.env.SystemRoot };
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
  const env = { PATH: safePath(), HOME: home, USERPROFILE: home, SystemRoot: process.env.SystemRoot, ONRAILS_THREAD: "real-test" };
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
