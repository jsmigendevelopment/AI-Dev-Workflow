// Tests for the check before every signal (#126, #156): the registry is a file, so no record is trusted
// as written, and nothing onRails didn't start is ever signalled. They run on the fake machine in procs-fake.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { expire } from "../src/procs-hooks.mjs";
import { isAgent } from "../src/procs-records.mjs";
import { registryPath } from "../src/procs-store.mjs";
import { refusal } from "../src/procs-stop.mjs";
import { posixInfo } from "../src/procs-sys.mjs";
import { AGENT, fakeSys, records, run, seed, signals, startDev } from "./procs-fake.mjs";

test("a recorded PID that now belongs to another process is never signalled", async () => {
  const sys = fakeSys({ procs: { 4000: { start: "a later start" } } });
  seed(sys, { id: "preuse", pid: 4000, start: "start-4000", command: "pnpm dev", agent: { pid: AGENT, start: `start-${AGENT}` }, session: "s-1" });
  await run(sys, ["stop", "mine"]);
  assert.equal(sys.calls.length, 0);
  assert.ok(sys.live.has(4000));
  assert.deepEqual(records(sys), [], "the record is dropped instead");
});

// Fix round 1 on #154: the registry is a file, so nothing in it is trusted before a signal.
test("a record with no start time is never alive and never signalled, by stop, the watcher or the session-end hook", async () => {
  const sys = fakeSys({ procs: { 4000: {}, 4001: {} }, stdin: '{"session_id":"s-1"}' });
  const me = { session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } };
  seed(sys, { id: "pnull", pid: 4000, start: null, command: "pnpm dev", ...me });
  seed(sys, { id: "pnone", pid: 4001, start: undefined, command: "vite", deadline: "2026-11-26T09:00:00Z" });
  assert.equal((await run(sys, ["list"])).out, "Nothing registered is running.", "neither is alive");
  await expire(sys, registryPath(sys, sys.cwd));
  for (const argv of [["stop", "mine"], ["stop", "stale"], ["stop", "all", "--yes"], ["session-end"]]) await run(sys, argv);
  assert.deepEqual(signals(sys), [], "whatever runs with those PIDs now is left alone");
  assert.ok(sys.live.has(4000) && sys.live.has(4001));
});

test("start doesn't record a process whose start time can't be read: it stops it through its own handle and says so", async () => {
  const sys = fakeSys({ hidden: true });
  const r = await startDev(sys);
  assert.equal(r.code, 1);
  assert.match(r.out, /pnpm exited at once, or its start time can't be read, so it isn't recorded and was stopped/);
  assert.deepEqual(records(sys), []);
  assert.ok(sys.calls.includes("killSpawned 7000"));
  assert.deepEqual(signals(sys), [], "no signal by PID");
});

test("refusal: PID 1, 0, negatives, non-integers, ours, a missing or changed start time and a group it doesn't lead are all refused", () => {
  const ctx = { guard: new Set([999, 900, AGENT]), platform: "linux" };
  const p = { start: "s", group: 4000 };
  const ok = { pid: 4000, start: "s", group: true };
  assert.equal(refusal(ok, p, ctx), null, "a good record passes");
  const refused = {
    "PID 1": [{ ...ok, pid: 1 }, { start: "s", group: 1 }],
    "PID 0": [{ ...ok, pid: 0 }, { start: "s", group: 0 }],
    "a negative PID": [{ ...ok, pid: -1 }, p],
    "a PID that isn't an integer": [{ ...ok, pid: "4000" }, p],
    "this process": [{ ...ok, pid: 999 }, { start: "s", group: 999 }],
    "its parent": [{ ...ok, pid: 900 }, { start: "s", group: 900 }],
    "the agent": [{ ...ok, pid: AGENT }, { start: "s", group: AGENT }],
    "the record's own agent": [{ ...ok, agent: { pid: 4000 } }, p],
    "a null start": [{ ...ok, start: null }, p],
    "no start": [{ pid: 4000, group: true }, p],
    "an empty start": [{ ...ok, start: "" }, { ...p, start: "" }],
    "a changed start": [ok, { ...p, start: "later" }],
    "a dead process": [ok, undefined],
    "a group it doesn't lead": [ok, { ...p, group: 3000 }],
  };
  for (const [name, [r, live]] of Object.entries(refused)) assert.ok(refusal(r, live, ctx), `${name} must be refused`);
});

test("a registry record {pid: 1, group: true, start: null} with a dead agent gets no signal from session-end, stop stale or ps", async () => {
  const sys = fakeSys({ procs: { 1: { args: "init", group: 1 }, 4000: { group: 3000 } }, stdin: '{"session_id":"s-1"}' });
  const procs = [
    { id: "pone", pid: 1, start: null }, { id: "pzero", pid: 0, start: "start-0" }, { id: "pneg", pid: -1, start: "start-1" },
    { id: "pinit", pid: 1, start: "start-1" }, { id: "pagent", pid: AGENT, start: `start-${AGENT}` },
    { id: "pgrp", pid: 4000, start: "start-4000" },
  ];
  for (const rec of procs) seed(sys, { group: true, command: "x", ...rec });
  const end = await run(sys, ["session-end"]);
  const reaper = sys.calls.find((c) => / reap --registry /.test(c));
  if (reaper) await run(sys, reaper.split(" ").slice(3));
  await run(sys, ["stop", "stale"]);
  await run(sys, ["ps", "--stop", "all", "--yes"]);
  assert.deepEqual(signals(sys), [], end.out);
  assert.ok(sys.live.has(1) && sys.live.has(AGENT) && sys.live.has(4000));
});

test("stop <pid> after a yes still never signals PID 1, this script, its parent or the agent", async () => {
  const sys = fakeSys({ procs: { 1: { args: "init" }, 900: { args: "bash" } } });
  for (const pid of [1, 900, AGENT]) {
    const r = await run(sys, ["ps", "--stop", String(pid), "--yes"]);
    assert.equal(r.code, 1);
    assert.match(r.out, new RegExp(`Left PID ${pid} alone`));
  }
  assert.deepEqual(signals(sys), []);
});

test("a group whose leader exits on TERM still gets KILL while a member is left", async () => {
  const sys = fakeSys({ procs: { 4000: {}, 4001: { parent: 4000, group: 4000, onTerm: "stay" } } });
  seed(sys, { id: "pgroup", pid: 4000, start: "start-4000", command: "pnpm dev", session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } });
  const r = await run(sys, ["stop", "pgroup"]);
  assert.deepEqual(signals(sys), ["kill -4000 SIGTERM", "kill -4000 SIGKILL"], r.out);
  assert.ok(!sys.live.has(4001), "the member that ignored TERM is gone");
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

test("AC-156-2: WHEN one registry holds a PID above 2147483647 THEN the other records are still surveyed and stopped as before", async () => {
  const START = "Thu Nov 26 09:00:00 2026";
  const sys = fakeSys({ procs: { 4000: { start: START } } });
  const table = sys.info;
  // ps itself, which fails on a PID out of range: the real column parsing runs on its output.
  const ps = (cmd, args) => {
    const pids = args[args.indexOf("-p") + 1].split(",").map(Number);
    if (pids.some((p) => p > 2147483647)) return null;
    return [...table(pids)].map(([pid, p]) => `${pid} ${p.parent} ${p.group} S 0.0 2048 ${p.start}`).join("\n");
  };
  sys.info = (pids) => posixInfo(ps, pids);
  seed(sys, { id: "phuge", pid: 2147483648, start: START, command: "vite" });
  seed(sys, { id: "pold1", pid: 4000, start: START, command: "pnpm dev" });
  assert.match((await run(sys, ["list"])).out, /pold1 · STALE: its owner session is gone · pid 4000/);
  const r = await run(sys, ["stop", "stale"]);
  assert.match(r.out, /Stopped pold1: pnpm dev/);
  assert.deepEqual(signals(sys), ["kill -4000 SIGTERM"]);
  assert.ok(!sys.live.has(4000));
});

test("AC-156-1: WHEN a group record's group holds this script, its parent or the agent THEN no signal is sent", async () => {
  const me = { session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } };
  for (const [name, pid, args] of [["this script", 999, "node procs.mjs"], ["its parent", 900, "bash"], ["the agent", AGENT, "/opt/claude-code/bin/claude"]]) {
    const sys = fakeSys({ procs: { 4000: { args: "pnpm dev" }, [pid]: { args, parent: 4000, group: 4000 } }, stdin: '{"session_id":"s-1"}' });
    seed(sys, { id: "pmine", pid: 4000, start: "start-4000", command: "pnpm dev", ...me });
    seed(sys, { id: "pstale", pid: 4000, start: "start-4000", command: "pnpm dev" });
    for (const argv of [["stop", "pmine"], ["stop", "stale"], ["stop", "all", "--yes"], ["session-end"]]) await run(sys, argv);
    const reaper = sys.calls.find((c) => / reap --registry /.test(c));
    if (reaper) await run(sys, reaper.split(" ").slice(3));
    assert.deepEqual(signals(sys), [], name);
    assert.ok(sys.live.has(pid) && sys.live.has(4000), name);
  }
});

test("AC-156-1: WHEN the agent joins a record's group after the TERM THEN no KILL is sent, with the leader still running or only members left", async () => {
  const me = { session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } };
  for (const leader of ["stay", "exit"]) {
    const sys = fakeSys({ procs: { 4000: { onTerm: leader }, 4001: { parent: 4000, group: 4000, onTerm: "stay" } } });
    seed(sys, { id: "pgroup", pid: 4000, start: "start-4000", command: "pnpm dev", ...me });
    const send = sys.signal;
    sys.signal = (pid, sig) => { const hit = send(pid, sig); sys.live.get(AGENT).group = 4000; return hit; };
    await run(sys, ["stop", "pgroup"]);
    assert.deepEqual(signals(sys), ["kill -4000 SIGTERM"], `leader ${leader}`);
    assert.ok(sys.live.has(4001) && sys.live.has(AGENT), `leader ${leader}`);
  }
});

test("AC-174-3: WHEN a non-group record's PID is the agent's parent THEN no signal is sent, and a group record's neither", async () => {
  const me = { session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } };
  // The agent's parent in another group than the agent (a shell with job control), or in the agent's; or it leads its own.
  for (const [group, parentGroup, agentGroup] of [[false, 3000, AGENT], [false, 3000, 3000], [true, 450, AGENT]]) {
    for (const argv of [["stop", "pmine"], ["stop", "stale"], ["stop", "all", "--yes"], ["session-end"], ["ps", "--stop", "450", "--yes"]]) {
      const procs = { 450: { args: "bash", group: parentGroup }, [AGENT]: { args: "/opt/claude-code/bin/claude", parent: 450, group: agentGroup } };
      const sys = fakeSys({ procs, stdin: '{"session_id":"s-1"}' });
      if (argv[0] !== "ps") {
        seed(sys, { id: "pmine", pid: 450, start: "start-450", group, command: "bash", ...me });
        seed(sys, { id: "pstale", pid: 450, start: "start-450", group, command: "bash" });
      }
      const r = await run(sys, argv);
      const reaper = sys.calls.find((c) => / reap --registry /.test(c));
      if (reaper) await run(sys, reaper.split(" ").slice(3));
      const at = `group ${group}, ${argv.join(" ")}`;
      assert.deepEqual(signals(sys), [], `${at}\n${r.out}`);
      assert.ok(sys.live.has(450) && sys.live.has(AGENT), at);
    }
  }
});

test("AC-174-3: WHEN a non-group record's tree holds the agent below its parent THEN no signal is sent (Linux)", async () => {
  const me = { session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } };
  // The record is the agent's grandparent: 400, then the shell 450, then the agent. Only its tree shows that.
  const procs = { 400: { args: "sshd", group: 400 }, 450: { args: "bash", parent: 400, group: 450 }, [AGENT]: { args: "/opt/claude-code/bin/claude", parent: 450, group: AGENT } };
  for (const argv of [["stop", "pmine"], ["stop", "all", "--yes"], ["session-end"]]) {
    const sys = fakeSys({ procs, stdin: '{"session_id":"s-1"}' });
    seed(sys, { id: "pmine", pid: 400, start: "start-400", group: false, command: "sshd", ...me });
    const r = await run(sys, argv);
    const reaper = sys.calls.find((c) => / reap --registry /.test(c));
    if (reaper) await run(sys, reaper.split(" ").slice(3));
    assert.deepEqual(signals(sys), [], `${argv.join(" ")}\n${r.out}`);
    assert.ok(sys.live.has(400) && sys.live.has(AGENT), argv.join(" "));
  }
});

test("AC-174-3: WHEN the process table can't be read THEN a non-group record gets no signal (Linux)", async () => {
  const sys = fakeSys({ procs: { 4000: { group: 3000 } } });
  sys.table = () => null;
  seed(sys, { id: "ptree", pid: 4000, start: "start-4000", group: false, command: "pnpm dev", session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } });
  const r = await run(sys, ["stop", "ptree"]);
  assert.deepEqual(signals(sys), [], r.out);
  assert.match(r.out, /Left ptree alone: the process tree can't be read/);
});

test("AC-174-2, AC-174-3: WHEN the agent joins a record's tree after the TERM THEN no KILL is sent (Linux and Windows)", async () => {
  for (const [platform, term] of [["linux", "kill 4000 SIGTERM"], ["win32", "taskkill /PID 4000 /T"]]) {
    const sys = fakeSys({ platform, procs: { 4000: { group: 3000, onTerm: "stay" } } });
    seed(sys, { id: "ptree", pid: 4000, start: "start-4000", group: false, command: "pnpm dev", session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } });
    const [send, taskkill] = [sys.signal, sys.taskkill];
    sys.signal = (pid, sig) => { const hit = send(pid, sig); sys.live.get(AGENT).parent = 4000; return hit; };
    sys.taskkill = (pid, force) => { const hit = taskkill(pid, force); sys.live.get(AGENT).parent = 4000; return hit; };
    await run(sys, ["stop", "ptree"]);
    assert.deepEqual(signals(sys), [term], platform);
    assert.ok(sys.live.has(4000) && sys.live.has(AGENT), platform);
  }
});
