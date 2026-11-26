// Tests that the detached runners, the session-end reaper and the watcher, never signal the agent or its parent
// (#174, round 1 of #236). They outlive the command that started them, so their parent is gone, and with no CLAUDE_PID
// (as under Codex) walking up never reaches the agent. Each runs here on a fresh fake machine: no CLAUDE_PID, the
// command that started it gone, and PID 1 as its parent. No process is started and no signal is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { homeRegistry } from "../src/procs-store.mjs";
import { AGENT, MIN, NOW, fakeSys, records, run, seed, signals, startDev } from "./procs-fake.mjs";

const NO_PID = { CLAUDE_CODE_SESSION_ID: "s-1" };
const ME = { session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } };
const PAST = new Date(NOW - MIN).toISOString();

// What the agent's commands see: the agent under a shell (450), the hook or start (900) under the agent, and a
// dev server (4000) of its own. shared: the agent is in the shell's process group, so a group record for the shell reaches it.
function machine(shared) {
  const procs = { 450: { args: "bash", group: 450 }, [AGENT]: { args: "/opt/claude-code/bin/claude", parent: 450, group: shared ? 450 : AGENT },
    900: { args: "sh -c node procs.mjs", parent: AGENT, group: AGENT }, 4000: { args: "vite" } };
  return fakeSys({ env: NO_PID, procs, stdin: '{"session_id":"s-1"}' });
}

// The same processes, seen from the detached runner: the command that started it (900) has exited, its parent is PID 1.
function detached(sys) {
  const fresh = fakeSys({ env: NO_PID });
  Object.assign(fresh, { home: sys.home, cwd: sys.cwd, parentPid: 1 });
  fresh.live.clear();
  for (const [pid, p] of sys.live) if (pid !== 900) fresh.live.set(pid, { ...p });
  return fresh;
}

// The argv the fake machine was asked to spawn for the reaper or the watcher, from the word after procs.mjs on.
const argvOf = (sys, word) => sys.calls.find((c) => c.includes(` ${word} --registry `))?.split(" ").slice(3);
const withoutGuard = (argv) => argv.filter((a, i) => a !== "--guard" && argv[i - 1] !== "--guard");
const shell = (group, more) => ({ pid: 450, start: "start-450", group, command: "bash", ...more });
const vite = { id: "pfree", pid: 4000, start: "start-4000", group: true, command: "vite" };

test("AC-174-3: WHEN the reaper runs with no CLAUDE_PID and a parent that doesn't lead to the agent THEN a record for the agent's parent gets no signal", async () => {
  for (const group of [false, true]) {
    // Records of an ended session (their agent is gone): only what the hook passed guards the agent, and tells the
    // reaper where it is, so the dev server still stops. This session's record: its own agent guards it, even from a
    // reaper started by hand with no --guard; the ended session's dev server then has nothing that tells, so it stays.
    for (const [name, recs, strip, sent] of [["an ended session's records", [shell(group, { id: "pold" }), vite], false, ["kill -4000 SIGTERM"]],
      ["this session's record, no --guard", [shell(group, { id: "pmine", ...ME }), vite], true, []]]) {
      const sys = machine(group);
      for (const rec of recs) seed(sys, rec);
      await run(sys, ["session-end"]);
      const argv = argvOf(sys, "reap");
      assert.equal(argv?.[argv.indexOf("--guard") + 1], `${AGENT}@start-${AGENT},450@start-450`, "the hook passes the agent and its parent");
      const fresh = detached(sys);
      await run(fresh, strip ? withoutGuard(argv) : argv);
      const at = `group ${group}, ${name}`;
      assert.deepEqual(signals(fresh), sent, at);
      assert.ok(fresh.live.has(450) && fresh.live.has(AGENT), at);
    }
  }
});

test("AC-174-3: WHEN one watcher pass runs with no CLAUDE_PID and a parent that doesn't lead to the agent THEN a record for the agent's parent gets no signal, and its own records still stop", async () => {
  for (const group of [false, true]) {
    const sys = machine(group);
    await startDev(sys, ["--for", "15"]);
    const dev = records(sys).find((r) => r.kind === "process");
    seed(sys, shell(group, { id: "pold", deadline: PAST }));
    const argv = argvOf(sys, "watch");
    assert.equal(argv?.[argv.indexOf("--guard") + 1], `${AGENT}@start-${AGENT},450@start-450`, "start passes the agent and its parent");
    const fresh = detached(sys);
    await run(fresh, argv);
    assert.deepEqual(signals(fresh), [`kill -${dev.pid} SIGTERM`], `group ${group}: only the dev server, once its time is up`);
    assert.ok(fresh.live.has(450) && fresh.live.has(AGENT), `group ${group}`);
  }
});

test("AC-174-3: WHEN a detached runner can't know the agent at all THEN it signals no tree or group, and keeps the record", async () => {
  for (const group of [false, true]) {
    const sys = fakeSys({ env: NO_PID, procs: { 4000: { onTerm: "stay" } } });
    sys.parentPid = 1;
    seed(sys, { id: "pold", pid: 4000, start: "start-4000", group, command: "vite", deadline: PAST });
    const path = homeRegistry(sys);
    await run(sys, ["reap", "--registry", path, "pold"]);
    await run(sys, ["watch", "--registry", path]);
    assert.deepEqual(signals(sys), [], `group ${group}`);
    assert.deepEqual(records(sys).map((r) => r.id), ["pold"], `group ${group}: a later session can still stop it`);
  }
});
