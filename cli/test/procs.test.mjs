// Tests for the process registry (#126): every background process an agent starts gets a record,
// pause and stop do different things, the session-end hook cleans up, and onrails ps shows and stops
// what's left. They run on the fake machine in procs-fake.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expire } from "../src/procs-hooks.mjs";
import { load, registryPath } from "../src/procs-store.mjs";
import { processChecks } from "../src/project-checks.mjs";
import { put } from "./helpers.mjs";
import { AGENT, MIN, fakeSys, inRepo, records, run, seed, signals, startDev } from "./procs-fake.mjs";

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
  const sys = fakeSys({ git: inRepo("") });
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

test("AC-5: off the CLI, stop all or stop <id> of another live session is refused without --yes", async () => {
  const fresh = () => {
    const sys = fakeSys({ procs: { 601: { args: "claude" }, 4100: {} } });
    seed(sys, { id: "pother", pid: 4100, start: "start-4100", command: "astro dev", session: "s-2", agent: { pid: 601, start: "start-601" } });
    return sys;
  };
  for (const argv of [["stop", "all"], ["stop", "pother"], ["stop", "4100"]]) {
    const sys = fresh();
    const r = await run(sys, argv);
    assert.equal(r.code, 1, argv.join(" "));
    assert.match(r.out, /another live session started pother \(other\)\. Ask the person first\. After a yes: node \.agents\/skills\/ask\/scripts\/procs\.mjs stop \S+ --yes/);
    assert.deepEqual(signals(sys), [], argv.join(" "));
  }
  const yes = fresh();
  assert.equal((await run(yes, ["stop", "pother", "--yes"])).code, 0);
  assert.ok(!yes.live.has(4100));
  const no = fresh();
  assert.equal((await run(no, ["ps", "--stop", "all"], { ask: async () => "n" })).code, 1, "the person at the CLI is asked");
  assert.deepEqual(signals(no), []);
  const asked = fresh();
  assert.equal((await run(asked, ["ps", "--stop", "all"], { ask: async () => "y" })).code, 0);
  assert.ok(!asked.live.has(4100));
});

test("AC-156-3: WHEN stop all or stop <id> meets another session's record with no agent, off the CLI and without --yes, THEN it is refused", async () => {
  const fresh = (owner) => {
    const sys = fakeSys({ procs: { 4100: {} } });
    seed(sys, { id: "pother", pid: 4100, start: "start-4100", command: "astro dev", agent: null, ...owner });
    return sys;
  };
  for (const owner of [{ session: "s-2" }, { session: null }]) {
    for (const argv of [["stop", "all"], ["stop", "pother"], ["stop", "4100"]]) {
      const sys = fresh(owner);
      const r = await run(sys, argv);
      assert.equal(r.code, 1, argv.join(" "));
      assert.match(r.out, /started pother \(other\)\. Ask the person first\. After a yes: node \.agents\/skills\/ask\/scripts\/procs\.mjs stop \S+ --yes/);
      assert.deepEqual(signals(sys), [], argv.join(" "));
      assert.ok(sys.live.has(4100));
    }
  }
  const yes = fresh({ session: "s-2" });
  assert.equal((await run(yes, ["stop", "pother", "--yes"])).code, 0);
  assert.ok(!yes.live.has(4100));
  const no = fresh({ session: "s-2" });
  assert.equal((await run(no, ["ps", "--stop", "all"], { ask: async () => "n" })).code, 1, "the person at the CLI is asked");
  assert.deepEqual(signals(no), []);
});

test("list, ps and doctor write nothing; stop drops the records of processes that have exited", async () => {
  const sys = fakeSys({ procs: { 4000: {} } });
  seed(sys, { id: "pdead", pid: 4100, start: "start-4100", command: "vite" });
  seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev", session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } });
  const path = registryPath(sys, sys.cwd);
  const before = [readFileSync(path, "utf8"), statSync(path).mtimeMs];
  await run(sys, ["list"]);
  await run(sys, ["ps"]);
  processChecks(sys.cwd, { sys });
  assert.deepEqual([readFileSync(path, "utf8"), statSync(path).mtimeMs], before);
  await run(sys, ["stop", "pold1"]);
  assert.deepEqual(records(sys), [], "the exited one is dropped on stop");
});

test("the session-end hook stops the watcher too, the registry's only timer", async () => {
  const sys = fakeSys({ stdin: '{"session_id":"s-1"}' });
  await startDev(sys, ["--for", "15"]);
  const watcher = records(sys).find((r) => r.kind === "watcher");
  await run(sys, ["session-end"]);
  const reaper = sys.calls.find((c) => / reap --registry /.test(c));
  assert.ok(reaper.split(" ").includes(watcher.id));
});
