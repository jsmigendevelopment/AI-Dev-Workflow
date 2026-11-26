// Tests for the process registry (#126): every background process an agent starts gets a record,
// pause and stop do different things, the session-end hook cleans up, and onrails ps shows and stops
// what's left. A fake machine stands in for ps, kill and spawn; one test starts and stops a real,
// harmless child that it owns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expire, isAgent, main } from "../src/procs.mjs";
import { load, registryPath } from "../src/procs-store.mjs";
import { processChecks } from "../src/project-checks.mjs";
import { logger, put, tmp } from "./helpers.mjs";

const NOW = Date.parse("2026-11-26T10:00:00Z");
const MIN = 60_000;
const AGENT = 500; // the agent's own process (claude) in the fake
const SCRIPT = fileURLToPath(new URL("../../.agents/skills/ask/scripts/procs.mjs", import.meta.url));
const repoFile = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");

// A fake machine. procs: { pid: { args, parent, group, start, onTerm: "exit" | "stay" } }. Every signal is recorded.
function fakeSys({ platform = "linux", env = { CLAUDE_CODE_SESSION_ID: "s-1", CLAUDE_PID: String(AGENT) }, procs = {}, git = () => null, stdin = "" } = {}) {
  let clock = NOW, next = 7000;
  const live = new Map();
  const put1 = (pid, p) => live.set(pid, { parent: 1, group: pid, start: `start-${pid}`, args: "node x", cpu: "0.0% CPU", mem: 2048, onTerm: "exit", ...p });
  put1(AGENT, { args: "/opt/claude-code/bin/claude" });
  for (const [pid, p] of Object.entries(procs)) put1(Number(pid), p);
  const calls = [];
  const end = (pid, sig) => { if (sig === "SIGKILL" || live.get(pid)?.onTerm === "exit") live.delete(pid); };
  return {
    platform, env, home: tmp("procs-home-"), cwd: tmp("procs-cwd-"), parentPid: 900, selfPid: 999, calls, live,
    now: () => clock, advance: (ms) => { clock += ms; },
    git: (dir, args) => git(dir, args),
    info: (pids) => new Map(pids.filter((p) => live.has(p)).map((p) => [p, live.get(p)])),
    table: () => [...live].map(([pid, p]) => ({ pid, ppid: p.parent, args: p.args })),
    signal(pid, sig) {
      calls.push(`kill ${pid} ${sig}`);
      const hit = pid < 0 ? [...live].filter(([, p]) => p.group === -pid).map(([p]) => p) : live.has(pid) ? [pid] : [];
      for (const p of hit) end(p, sig);
      return hit.length > 0;
    },
    taskkill(pid, force) { calls.push(`taskkill /PID ${pid} /T${force ? " /F" : ""}`); if (live.has(pid)) end(pid, force ? "SIGKILL" : "SIGTERM"); return true; },
    spawn(argv) {
      const pid = next++;
      calls.push(`spawn ${argv.join(" ")}`);
      put1(pid, { args: argv.join(" ") });
      return pid;
    },
    sleep: async (ms) => { clock += ms; },
    stdin: async () => stdin,
  };
}

const run = async (sys, argv, extra = {}) => {
  const log = logger();
  const code = await main(argv, { sys, log, ...extra });
  return { code, out: log.text() };
};
const startDev = (sys, more = []) => run(sys, ["start", "--why", "show the person #12", "--until", "the person leaves", ...more, "--", "pnpm", "dev"]);
const records = (sys) => load(registryPath(sys, sys.cwd));
// A record made by another session: its agent process is `agent`, alive or not.
function seed(sys, rec) {
  put(sys.home, ".onrails/procs.json", JSON.stringify({ version: 1, procs: [...records(sys), {
    kind: "process", group: true, why: "w", until: "u", deadline: null, state: "running", pausedUntil: null, label: "other",
    startedAt: new Date(NOW - 3 * 24 * 60 * MIN).toISOString(), session: "s-old", agent: { pid: 600, start: "start-600" }, ...rec,
  }] }));
}

test("AC-1: WHEN an agent starts a dev server THEN it's in the registry, with its owner and a stop condition", async () => {
  const sys = fakeSys();
  const r = await startDev(sys);
  assert.equal(r.code, 0, r.out);
  const [rec] = records(sys);
  assert.equal(rec.command, "pnpm dev");
  assert.equal(rec.why, "show the person #12");
  assert.equal(rec.until, "the person leaves");
  assert.equal(rec.session, "s-1");
  assert.deepEqual(rec.agent, { pid: AGENT, start: `start-${AGENT}` });
  assert.equal(rec.start, `start-${rec.pid}`, "its start time, so a reused PID is never taken for it");
  assert.ok(sys.live.has(rec.pid));
  assert.match((await run(sys, ["list"])).out, /running · pid 7000 .* owner s-1 \(alive\)\n {4}pnpm dev · why: show the person #12 · until: the person leaves/);
});

test("AC-1: starting one without a reason or a stop condition isn't allowed, and nothing starts", async () => {
  const sys = fakeSys();
  const r = await run(sys, ["start", "--why", "dev", "--", "pnpm", "dev"]);
  assert.equal(r.code, 2);
  assert.match(r.out, /a reason and a stop condition/);
  assert.equal(sys.calls.length, 0);
});

test("AC-1: in a repo the registry is the main checkout's .onrails/procs.json, shared by worktrees, and it ignores itself", async () => {
  const sys = fakeSys({ git: (dir, args) => (args.includes("--git-common-dir") ? ".git" : null) });
  await startDev(sys);
  const path = join(sys.cwd, ".onrails", "procs.json");
  assert.equal(load(path).length, 1);
  assert.equal(readFileSync(join(sys.cwd, ".onrails", ".gitignore"), "utf8"), "*\n");
  const worktree = fakeSys({ git: () => "/repos/app/.git" });
  assert.equal(registryPath(worktree, "/repos/app/.claude/worktrees/b"), join("/repos/app", ".onrails", "procs.json"));
});

test("AC-1: --for sets a deadline and starts the watcher, which stops it once the time has passed", async () => {
  const sys = fakeSys();
  await startDev(sys, ["--for", "15"]);
  const [dev] = records(sys).filter((r) => r.kind === "process");
  assert.equal(dev.deadline, "2026-11-26T10:15:00Z");
  assert.ok(sys.calls.some((c) => / watch --registry /.test(c)), "the watcher started");
  assert.equal(await expire(sys, registryPath(sys, sys.cwd)), 1, "not due yet");
  assert.ok(sys.live.has(dev.pid));
  sys.advance(16 * MIN);
  assert.equal(await expire(sys, registryPath(sys, sys.cwd)), 0);
  assert.ok(!sys.live.has(dev.pid));
  assert.ok(sys.calls.includes(`kill -${dev.pid} SIGTERM`));
});

test("AC-2: WHEN the person says stop THEN stop mine ends this session's processes and the list it shows is empty", async () => {
  const sys = fakeSys({ procs: { 600: { args: "claude" }, 4000: {} } });
  await startDev(sys);
  await startDev(sys);
  seed(sys, { id: "pother", pid: 4000, start: "start-4000", command: "vite" });
  const r = await run(sys, ["stop", "mine"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Stopped p[0-9a-f]{4}: pnpm dev\nStopped p[0-9a-f]{4}: pnpm dev\nNothing this session started is running\.$/);
  assert.ok(!sys.live.has(7000) && !sys.live.has(7001));
  assert.ok(sys.live.has(4000), "another live session's process is left alone");
  assert.deepEqual(records(sys).map((x) => x.id), ["pother"]);
});

test("AC-2b: WHEN the person says pause THEN this session's processes stay, marked paused, and stop once the pause limit passes", async () => {
  const sys = fakeSys();
  await startDev(sys);
  const r = await run(sys, ["pause"]);
  assert.match(r.out, /Paused 1\. Each stops at 2026-11-26T12:00:00Z or when this session ends/);
  assert.match(r.out, /paused until 2026-11-26T12:00:00Z/);
  assert.ok(sys.calls.some((c) => / watch --registry /.test(c)), "a watcher enforces the limit even if the session sits open");
  const path = registryPath(sys, sys.cwd);
  sys.advance(119 * MIN);
  await expire(sys, path);
  assert.ok(sys.live.has(7000), "still within the pause");
  sys.advance(2 * MIN);
  await expire(sys, path);
  assert.ok(!sys.live.has(7000), "a forgotten pause turns into a stop");
});

test("AC-2b: the pause limit comes from [workflow] pause_hours, and resume clears the pause", async () => {
  const sys = fakeSys();
  put(sys.home, ".onrails/profile.toml", "[workflow]\npause_hours = 0.5\n");
  await startDev(sys);
  assert.match((await run(sys, ["pause"])).out, /stops at 2026-11-26T10:30:00Z/);
  assert.equal((await run(sys, ["resume"])).out, "Resumed 1.");
  const dev = records(sys).find((x) => x.kind === "process");
  assert.equal(dev.state, "running");
  assert.equal(dev.pausedUntil, null);
});

test("AC-3: WHEN a session ends THEN the hook stops its processes and orphans, TERM then KILL, and a later session finds no orphans", async () => {
  const sys = fakeSys({ procs: { 601: { args: "claude" }, 4000: { onTerm: "stay" }, 4100: {} }, stdin: '{"session_id":"s-1","reason":"other"}' });
  await startDev(sys);
  seed(sys, { id: "porphan", pid: 4000, start: "start-4000", command: "vite --watch" });
  seed(sys, { id: "plive", pid: 4100, start: "start-4100", command: "astro dev", session: "s-2", agent: { pid: 601, start: "start-601" } });
  const end = await run(sys, ["session-end"]);
  assert.match(end.out, /Stopping 2 background process/);
  const reaper = sys.calls.find((c) => / reap --registry /.test(c));
  assert.ok(reaper, "a detached reaper does the wait, because Codex caps the hook at 3 s");
  const [, ...argv] = reaper.split(" ").slice(2);
  assert.equal((await run(sys, argv)).code, 0);
  assert.ok(sys.calls.includes("kill -7000 SIGTERM") && !sys.calls.includes("kill -7000 SIGKILL"), "it left on TERM");
  assert.ok(sys.calls.includes("kill -4000 SIGTERM") && sys.calls.includes("kill -4000 SIGKILL"), "it ignored TERM, so KILL after the grace");
  assert.ok(sys.live.has(4100), "another live session's process is left alone");
  assert.equal((await run(sys, ["session-start"])).out, "", "no orphans for the next session");
});

test("AC-4: WHEN onrails ps finds a process whose owner session is gone THEN it's flagged stale, and --stop stale stops it", async () => {
  const sys = fakeSys({ procs: { 4000: {} } });
  seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev" });
  const ps = await run(sys, ["ps"]);
  assert.match(ps.out, /pold1 · STALE: its owner session is gone · pid 4000 · 3d 0h/);
  assert.match(ps.out, /Stale: 1\. Stop them: npx onrails ps --stop stale/);
  const stop = await run(sys, ["ps", "--stop", "stale"]);
  assert.match(stop.out, /Stopped pold1: pnpm dev\nNothing registered is running\./);
  assert.ok(!sys.live.has(4000));
  assert.match((await run(sys, ["session-start"])).out, /^$/);
});

test("AC-4: the session-start hook warns about orphans and names the command that stops them", async () => {
  const sys = fakeSys({ procs: { 4000: {} } });
  seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev" });
  const r = await run(sys, ["session-start"]);
  assert.match(r.out, /### Background processes left running/);
  assert.match(r.out, /- pold1 · pnpm dev · 3d 0h · its owner session is gone/);
  assert.match(r.out, /procs\.mjs stop stale/);
  assert.ok(sys.live.has(4000), "it warns; it doesn't stop");
});

test("AC-5: WHEN a process wasn't registered by onRails THEN ps --stop asks before touching it", async () => {
  const no = fakeSys({ procs: { 4242: {} } });
  const asked = [];
  const r = await run(no, ["ps", "--stop", "4242"], { ask: async (q) => (asked.push(q), "n") });
  assert.equal(r.code, 1);
  assert.match(asked[0], /PID 4242 isn't in the registry: onRails didn't start it\. Stop it anyway\? \[y\/N\]/);
  assert.equal(no.calls.length, 0, "a no touches nothing");
  const yes = fakeSys({ procs: { 4242: {} } });
  assert.equal((await run(yes, ["ps", "--stop", "4242"], { ask: async () => "y" })).code, 0);
  assert.ok(yes.calls.includes("kill 4242 SIGTERM") && !yes.live.has(4242));
  const agent = fakeSys({ procs: { 4242: {} } });
  assert.match((await run(agent, ["stop", "4242"])).out, /Left PID 4242 alone: onRails didn't start it\. Ask the person first/);
  assert.equal(agent.calls.length, 0, "with no one to ask, an agent is told to ask the person");
});

test("a recorded PID that now belongs to another process is never signalled", async () => {
  const sys = fakeSys({ procs: { 4000: { start: "a later start" } } });
  seed(sys, { id: "preuse", pid: 4000, start: "start-4000", command: "pnpm dev", agent: { pid: AGENT, start: `start-${AGENT}` }, session: "s-1" });
  await run(sys, ["stop", "mine"]);
  assert.equal(sys.calls.length, 0);
  assert.ok(sys.live.has(4000));
  assert.deepEqual(records(sys), [], "the record is dropped instead");
});

test("a process that doesn't lead its own group: TERM goes to it and each of its children", async () => {
  const sys = fakeSys({ procs: { 4000: { group: 3000 }, 4001: { parent: 4000, group: 3000 }, 4002: { parent: 4001, group: 3000 } } });
  seed(sys, { id: "ptree", pid: 4000, start: "start-4000", group: false, command: "pnpm dev", session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } });
  await run(sys, ["stop", "ptree"]);
  assert.deepEqual(sys.calls, ["kill 4000 SIGTERM", "kill 4001 SIGTERM", "kill 4002 SIGTERM"]);
});

test("Windows: stop runs taskkill /T for the tree, then /T /F after the grace", async () => {
  const sys = fakeSys({ platform: "win32", procs: { 4000: { onTerm: "stay" } } });
  seed(sys, { id: "pwin1", pid: 4000, start: "start-4000", group: false, command: "pnpm dev", session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } });
  const r = await run(sys, ["stop", "pwin1"]);
  assert.deepEqual(sys.calls, ["taskkill /PID 4000 /T", "taskkill /PID 4000 /T /F"]);
  assert.match(r.out, /Killed pwin1 after 5 s/);
});

test("the agent is the claude or codex program, never a path in a shell's command line", () => {
  assert.ok(isAgent("/opt/claude-code/bin/claude --preload x"));
  assert.ok(isAgent("node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js"));
  assert.ok(isAgent("codex exec --full-auto"));
  assert.ok(isAgent("C:\\Users\\a\\codex.exe"));
  assert.ok(!isAgent("/bin/bash -c node /home/a/.claude/worktrees/b/procs.mjs"));
  assert.ok(!isAgent("node .claude/hooks/session-start.mjs"));
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
