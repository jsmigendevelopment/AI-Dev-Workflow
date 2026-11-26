// Tests that the detached runners, the session-end reaper and the watcher, never signal the agent or its parent
// (#174, round 1 of #236). They outlive the command that started them, so their parent is gone, and with no CLAUDE_PID
// (as under Codex) walking up never reaches the agent. Each runs here on a fresh fake machine: no CLAUDE_PID, the
// command that started it gone, and PID 1 as its parent. No process is started and no signal is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { isId, newId } from "../src/procs-records.mjs";
import { homeRegistry, registryPath } from "../src/procs-store.mjs";
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
const vite = { id: "pcafe", pid: 4000, start: "start-4000", group: true, command: "vite" };

test("AC-174-3: WHEN the reaper runs with no CLAUDE_PID and a parent that doesn't lead to the agent THEN a record for the agent's parent gets no signal", async () => {
  for (const group of [false, true]) {
    // Records of an ended session (their agent is gone): only what the hook passed guards the agent, and tells the
    // reaper where it is, so the dev server still stops. This session's record: its own agent guards it, even from a
    // reaper started by hand with no --guard; the ended session's dev server then has nothing that tells, so it stays.
    for (const [name, recs, strip, sent] of [["an ended session's records", [shell(group, { id: "p01d0" }), vite], false, ["kill -4000 SIGTERM"]],
      ["this session's record, no --guard", [shell(group, { id: "pface", ...ME }), vite], true, []]]) {
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
    seed(sys, shell(group, { id: "p01d0", deadline: PAST }));
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
    seed(sys, { id: "p01d0", pid: 4000, start: "start-4000", group, command: "vite", deadline: PAST });
    const path = homeRegistry(sys);
    await run(sys, ["reap", "--registry", path, "p01d0"]);
    await run(sys, ["watch", "--registry", path]);
    assert.deepEqual(signals(sys), [], `group ${group}`);
    assert.deepEqual(records(sys).map((r) => r.id), ["p01d0"], `group ${group}: a later session can still stop it`);
  }
});

// Round 2 of #236: what the registry holds never reaches the reaper's options. Records whose ids look like flags sit
// before a record for the agent's parent; the hook passes only ids shaped as the registry makes them, after `--`.
const GUARD = `${AGENT}@start-${AGENT},450@start-450`;
const ids = (sys) => records(sys).map((r) => r.id).sort();

test("AC-174-3: WHEN records with flag-like ids sit beside a record for the agent's parent THEN session-end and the reaper send no signal", async () => {
  for (const group of [false, true]) {
    const sys = machine(group);
    for (const id of ["--guard", "99999@x"]) seed(sys, { ...vite, id });
    seed(sys, shell(group, { id: "p01d0" }));
    await run(sys, ["session-end"]);
    const argv = argvOf(sys, "reap");
    const fresh = detached(sys);
    await run(fresh, argv);
    assert.deepEqual(signals(fresh), [], `group ${group}`);
    assert.ok(fresh.live.has(450) && fresh.live.has(AGENT) && fresh.live.has(4000), `group ${group}`);
    assert.deepEqual(argv.slice(argv.indexOf("--")), ["--", "p01d0"], `group ${group}: only the registry's own id, after --`);
  }
});

// #233, from the round 3 review of #236: a record the hook skips for its id is named and counted, never dropped in silence.
test("#233: WHEN session-end skips records whose id the registry didn't make THEN one line names and counts them, apart from the ones it stops", async () => {
  const sys = machine(false);
  for (const id of ["--guard", "99999@x"]) seed(sys, { ...vite, id });
  seed(sys, { ...vite, id: "pcafe" });
  const { out } = await run(sys, ["session-end"]);
  assert.match(out, /^Stopping 1 background process\(es\)/m);
  const skipped = 'Not stopping 2 background process(es) whose record id the registry didn\'t make ("--guard", "99999@x"), '
    + "so the id never reaches the reaper's options. They stay recorded, and the next session lists them as stale.";
  assert.ok(out.split("\n").includes(skipped), out);
  assert.deepEqual(ids(sys), ["--guard", "99999@x", "pcafe"], "nothing is dropped before the reaper runs");
});

// Round 1 of #244: what session-end prints for one skipped id, from the "Not stopping" line.
async function skippedAs(id) {
  const sys = machine(false);
  seed(sys, { ...vite, id });
  const line = (await run(sys, ["session-end"])).out.split("\n").find((l) => l.startsWith("Not stopping 1 "));
  return /make \((.*)\), so the id never/s.exec(line ?? "")?.[1];
}

test("#233: WHEN a skipped id holds an ANSI escape THEN session-end prints it escaped, with no raw ESC", async () => {
  assert.equal(await skippedAs("\u001b[31mx"), '"\\u001b[31mx"');
});

test("#233: WHEN a skipped id holds a C1 control, DEL, a bidi override or a line separator THEN session-end prints each escaped", async () => {
  assert.equal(await skippedAs("\u009b31m\u007f\u202eevil\u2066\u2028"), '"\\u009b31m\\u007f\\u202eevil\\u2066\\u2028"');
});

test("#233: WHEN a skipped id is long THEN session-end prints at most 40 characters, never half an escape or a surrogate pair", async () => {
  assert.equal(await skippedAs("a".repeat(200)), `"${"a".repeat(38)}\u2026`);
  assert.equal(await skippedAs(`${"b".repeat(34)}\u009bcc`), `"${"b".repeat(34)}\u2026`, "the escape would pass 40: it goes whole");
  assert.equal(await skippedAs(`${"d".repeat(37)}\u{1f600}`), `"${"d".repeat(37)}\u2026`, "the pair would pass 40: it goes whole");
  assert.equal(await skippedAs("e".repeat(38)), `"${"e".repeat(38)}"`, "40 characters with the quotes: kept whole");
});

test("#233: WHEN session-end skips 12 records THEN it counts all 12 and names the first 5, then and 7 more", async () => {
  const sys = machine(false);
  for (let n = 1; n <= 12; n++) seed(sys, { ...vite, id: `x${n}` });
  const { out } = await run(sys, ["session-end"]);
  const line = 'Not stopping 12 background process(es) whose record id the registry didn\'t make ("x1", "x2", "x3", "x4", "x5" and 7 more), '
    + "so the id never reaches the reaper's options. They stay recorded, and the next session lists them as stale.";
  assert.ok(out.split("\n").includes(line), out);
});

test("AC-174-3: WHEN the reaper is given ids after -- THEN each is only an id, and a flag-like one changes no option", async () => {
  for (const group of [false, true]) {
    const fresh = detached(machine(group));
    seed(fresh, vite);
    seed(fresh, shell(group, { id: "p01d0" }));
    await run(fresh, ["reap", "--registry", homeRegistry(fresh), "--guard", GUARD, "--", "--guard", "99999@x", "--grace", "0", "pcafe", "p01d0"]);
    assert.deepEqual(signals(fresh), ["kill -4000 SIGTERM"], `group ${group}: the dev server stops, the agent's parent doesn't`);
    assert.ok(fresh.live.has(450) && fresh.live.has(AGENT), `group ${group}`);
  }
});

test("AC-174-3: WHEN --guard, --registry or --grace is given twice THEN the command is refused and nothing is signalled", async () => {
  for (const flag of ["--guard", "--registry", "--grace"]) {
    const sys = detached(machine(true));
    const second = { "--guard": "99999@x", "--registry": join(sys.home, "elsewhere.json"), "--grace": "0" }[flag];
    seed(sys, vite);
    seed(sys, shell(true, { id: "p01d0" }));
    const argv = ["reap", "--registry", homeRegistry(sys), "--guard", GUARD, "--grace", "5", flag, second, "--", "pcafe", "p01d0"];
    const r = await run(sys, argv);
    assert.equal(r.code, 2, flag);
    assert.match(r.out, new RegExp(`${flag} is given twice`), flag);
    assert.deepEqual(signals(sys), [], flag);
    assert.deepEqual(ids(sys), ["p01d0", "pcafe"], `${flag}: every record is kept`);
  }
});

// Nice to have 3 of round 3: the same check covers every command, not only the reaper.
test("AC-174-3: WHEN start is given --why twice THEN it is refused and nothing starts or is signalled", async () => {
  const sys = fakeSys();
  const r = await run(sys, ["start", "--why", "show the person #12", "--why", "x", "--until", "the person leaves", "--", "pnpm", "dev"]);
  assert.equal(r.code, 2);
  assert.match(r.out, /--why is given twice/);
  assert.deepEqual(sys.calls, [], "no spawn and no signal");
  assert.deepEqual(records(sys), []);
});

test("AC-174-3: WHEN ps is given --stop twice THEN it is refused and nothing is signalled", async () => {
  const sys = fakeSys({ procs: { 4000: {} } });
  seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev" }); // stale: --stop stale alone would stop it
  const r = await run(sys, ["ps", "--stop", "pnone", "--stop", "stale"]);
  assert.equal(r.code, 2);
  assert.match(r.out, /--stop is given twice/);
  assert.deepEqual(signals(sys), []);
  assert.ok(sys.live.has(4000));
  assert.deepEqual(ids(sys), ["pold1"]);
});

// Nice to have 1 of round 3: isId writes out newId's shape a second time, so the two must not drift apart,
// or session-end would quietly pass no record to the reaper.
test("AC-174-3: every id newId makes passes isId", () => {
  const sys = fakeSys();
  const path = registryPath(sys, sys.cwd);
  for (let i = 0; i < 256; i++) {
    const id = newId(sys, path);
    assert.ok(isId(id), id);
  }
});

// #233, from the re-review of #236: random ids almost never hit the ends of the range, so a drift there (say, isId
// refusing p0000) would almost never fail above. The lowest and highest ids newId can make, and ids just past them.
test("#233: isId takes the lowest and highest ids newId can make, and refuses ids just past them", () => {
  for (const id of ["p0000", "pffff"]) assert.ok(isId(id), id);
  for (const id of ["p000", "pfffff", "pg000", "P0000", "pFFFF", "p0000\n"]) assert.equal(isId(id), false, JSON.stringify(id));
});

// Nice to have 1 of round 2: a --guard that can't be read tells nothing, so a record of an ended session is blind.
test("AC-174-3: WHEN --guard is malformed and there's no CLAUDE_PID THEN the reaper sends no signal and keeps the record", async () => {
  for (const bad of ["", "500","500@start-500,", ",,", "@x", "500@", "-5@x", "500@%E0%A4%A", `${GUARD.split(",")[0]},450@%`]) {
    const sys = detached(machine(false));
    seed(sys, shell(false, { id: "p01d0" }));
    await run(sys, ["reap", "--registry", homeRegistry(sys), "--guard", bad, "--", "p01d0"]);
    assert.deepEqual(signals(sys), [], bad);
    assert.deepEqual(ids(sys), ["p01d0"], `${bad}: a later session can still stop it`);
  }
});

// Nice to have 2 of round 2: the agent's parent's start can't be read for a moment when session-end runs.
test("AC-174-3: WHEN the agent's parent's start can't be read at session end THEN the reaper gets no --guard, signals nothing and keeps the records", async () => {
  for (const group of [false, true]) {
    const sys = machine(group);
    seed(sys, vite);
    seed(sys, shell(group, { id: "p01d0" }));
    const info = sys.info;
    sys.info = (pids) => (pids.length === 1 && pids[0] === 450 ? new Map() : info(pids)); // only the parent's own lookup fails
    await run(sys, ["session-end"]);
    const argv = argvOf(sys, "reap");
    assert.ok(argv && !argv.includes("--guard"), `group ${group}: no --guard rather than the agent alone`);
    const fresh = detached(sys);
    await run(fresh, argv);
    assert.deepEqual(signals(fresh), [], `group ${group}`);
    assert.deepEqual(ids(fresh), ["p01d0", "pcafe"], `group ${group}`);
  }
});
