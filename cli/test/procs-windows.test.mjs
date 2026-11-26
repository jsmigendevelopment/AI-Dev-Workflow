// Tests for the process registry on Windows (#174): who may write a registry, read through an ACL reader, and
// taskkill /T, which reaches a whole tree. Windows is a fake here: fakeSys({ platform: "win32" }) with a fake ACL
// reader, and realSys with a fake run. No process is started and no signal is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { realSys, winAccess } from "../src/procs-sys.mjs";
import { AGENT, fakeSys, inRepo, run, seed, signals, stamp, startDev } from "./procs-fake.mjs";

const OWN = { owned: true, writers: [] };
const STALE = { id: "pbad", pid: 4000, start: "start-4000", group: false, command: "pnpm dev" };
const MINE = { session: "s-1", agent: { pid: AGENT, start: `start-${AGENT}` } };
const STOPS = [["stop", "stale"], ["stop", "all", "--yes"], ["stop", "pbad", "--yes"], ["ps", "--stop", "all", "--yes"], ["session-end"]];

// Runs a command, then the reaper session-end would start, as the real one does.
async function runAll(sys, argv) {
  await run(sys, argv);
  const reaper = sys.calls.find((c) => / reap --registry /.test(c));
  if (reaper) await run(sys, reaper.split(" ").slice(3));
}

test("AC-174-1: WHEN the platform is win32 and the registry is writable by another account THEN it is never read for a signal (fake ACL reader)", async () => {
  const cases = {
    "its file": (home) => [join(home, ".onrails", "procs.json"), { owned: true, writers: ["S-1-5-11"] }],
    "its folder": (home) => [join(home, ".onrails"), { owned: true, writers: ["S-1-5-32-545"] }],
    "its logs folder": (home) => [join(home, ".onrails", "logs"), { owned: true, writers: ["S-1-1-0"] }],
    "another account owns its file": (home) => [join(home, ".onrails", "procs.json"), { owned: false, writers: [] }],
    "the reader can't tell": (home) => [join(home, ".onrails", "procs.json"), null],
  };
  for (const [name, which] of Object.entries(cases)) {
    for (const argv of STOPS) {
      let bad = [];
      const sys = fakeSys({ platform: "win32", procs: { 4000: {} }, stdin: '{"session_id":"s-1"}', winAcl: (path) => (path === bad[0] ? bad[1] : OWN) });
      bad = which(sys.home);
      seed(sys, STALE);
      mkdirSync(join(sys.home, ".onrails", "logs"), { recursive: true });
      await runAll(sys, argv);
      assert.deepEqual(signals(sys), [], `${name}: ${argv.join(" ")}`);
      assert.ok(sys.live.has(4000), name);
    }
  }
  // The control: the same registry, private, is read and its stale record stopped.
  const sys = fakeSys({ platform: "win32", procs: { 4000: {} } });
  seed(sys, STALE);
  await run(sys, ["stop", "stale"]);
  assert.deepEqual(signals(sys), ["taskkill /PID 4000 /T"]);
});

test("AC-174-1: WHEN a win32 repo's root is writable by another account THEN its registry is never read, and start starts nothing", async () => {
  for (const writers of [["S-1-5-11"], []]) {
    const sys = fakeSys({ platform: "win32", procs: { 4000: {} }, git: inRepo(""), winAcl: (path) => (path === sys.cwd ? { owned: true, writers } : OWN) });
    const dir = join(sys.cwd, ".onrails");
    mkdirSync(join(dir, "logs"), { recursive: true });
    writeFileSync(join(dir, "procs.json"), JSON.stringify({ version: 1, procs: [{ ...STALE, session: "s-old", agent: { pid: 600, start: "start-600" } }] }));
    chmodSync(join(dir, "procs.json"), 0o600);
    stamp(join(dir, "procs.json"));
    await run(sys, ["stop", "stale"]);
    assert.deepEqual(signals(sys), writers.length ? [] : ["taskkill /PID 4000 /T"], `writers ${writers}`);
  }
  const sys = fakeSys({ platform: "win32", git: inRepo(""), winAcl: (path) => (path === sys.cwd ? { owned: true, writers: ["S-1-5-11"] } : OWN) });
  const r = await startDev(sys);
  assert.equal(r.code, 1);
  assert.match(r.out, /Nothing started: the registry can't be used \(.* can be written by other accounts \(S-1-5-11\)/);
  assert.ok(!sys.calls.some((c) => c.startsWith("spawn")));
});

test("AC-174-1: the Windows ACL reader's output gives the owner and every other account that can write", () => {
  const me = "S-1-5-21-111-222-333-1001";
  const head = `user ${me}\r\nowner ${me}\r\nAllow S-1-5-18 2032127\r\nAllow S-1-5-32-544 2032127\r\nAllow ${me} 2032127\r\n`;
  assert.deepEqual(winAccess(head), OWN, "a profile folder: SYSTEM, Administrators and the user");
  assert.deepEqual(winAccess(`${head}Allow S-1-3-0 268435456\r\nAllow S-1-5-32-545 1179817\r\n`), OWN, "CREATOR OWNER, and Users who only read");
  assert.deepEqual(winAccess(`${head}Allow S-1-5-11 1245631\r\n`), { owned: true, writers: ["S-1-5-11"] }, "Authenticated Users can modify, as under C:\\");
  assert.deepEqual(winAccess(`${head}Allow S-1-5-32-545 4\r\nAllow S-1-5-32-545 2\r\n`), { owned: true, writers: ["S-1-5-32-545"] }, "Users can make folders");
  assert.deepEqual(winAccess(`${head}Allow S-1-1-0 268435456\r\n`), { owned: true, writers: ["S-1-1-0"] }, "generic all");
  assert.deepEqual(winAccess(`${head}Allow S-1-1-0 -1610612736\r\n`), OWN, "generic read and execute, a negative int32");
  assert.deepEqual(winAccess(`${head}Deny S-1-1-0 2032127\r\n`), OWN, "a deny grants nothing");
  assert.deepEqual(winAccess(`${head}nodacl\r\n`), { owned: true, writers: ["S-1-1-0"] }, "no DACL: everyone can write");
  assert.deepEqual(winAccess(head.replace(`owner ${me}`, "owner S-1-5-32-544")), OWN, "owned by Administrators, as an elevated session makes files");
  assert.deepEqual(winAccess(head.replace(`owner ${me}`, "owner S-1-5-21-111-222-333-1002")), { owned: false, writers: [] }, "another account owns it");
  for (const text of ["", null, head.replace(`user ${me}\r\n`, ""), head.replace(`owner ${me}\r\n`, ""), `${head}Allow S-1-5-11\r\n`, `${head}something else\r\n`]) {
    assert.equal(winAccess(text), null, JSON.stringify(text));
  }
});

test("AC-174-1: the real machine reads a Windows ACL through PowerShell with the path in the environment, never in the command; elsewhere it can't tell", () => {
  const ran = [];
  const out = "user S-1-5-21-1-2-3-1001\nowner S-1-5-21-1-2-3-1001\nAllow S-1-5-21-1-2-3-1001 2032127\n";
  const fakeRun = (cmd, args, opts) => (ran.push({ cmd, args, path: opts.env?.ONRAILS_ACL_PATH }), { status: 0, stdout: out });
  const path = "C:\\Users\\a\\it's [here]\\.onrails";
  assert.deepEqual(realSys({ platform: "win32", run: fakeRun }).winAcl(path), OWN);
  assert.equal(ran.length, 1);
  assert.equal(ran[0].cmd, "powershell.exe");
  assert.equal(ran[0].path, path);
  assert.ok(!ran[0].args.some((a) => a.includes("here")), "the path never reaches the command line");
  assert.equal(realSys({ platform: "win32", run: () => ({ status: 1, stdout: "", stderr: "denied" }) }).winAcl(path), null);
  assert.equal(realSys({ platform: "linux", run: fakeRun }).winAcl(path), null);
  assert.equal(ran.length, 1, "not asked off Windows");
});

test("AC-174-2: WHEN a win32 record's tree holds the agent, this script or its parent THEN no taskkill runs", async () => {
  for (const [name, pid, args] of [["the agent", AGENT, "C:\\claude\\claude.exe"], ["this script", 999, "node procs.mjs"], ["its parent", 900, "cmd.exe"]]) {
    for (const argv of [["stop", "pmine"], ...STOPS, ["stop", "4001", "--yes"]]) {
      const procs = { 4000: { onTerm: "stay" }, 4001: { parent: 4000, onTerm: "stay" }, [pid]: { args, parent: 4001 } };
      const sys = fakeSys({ platform: "win32", procs, stdin: '{"session_id":"s-1"}' });
      seed(sys, { ...STALE, id: "pmine", ...MINE });
      seed(sys, STALE);
      await runAll(sys, argv);
      assert.deepEqual(signals(sys), [], `${name}: ${argv.join(" ")}`);
      assert.ok(sys.live.has(4000) && sys.live.has(pid), name);
    }
  }
  // The process tree can't be read: whether it holds the agent can't be told, so nothing runs either.
  const sys = fakeSys({ platform: "win32", procs: { 4000: {} } });
  sys.table = () => null;
  seed(sys, { ...STALE, id: "pmine", ...MINE });
  const r = await run(sys, ["stop", "pmine"]);
  assert.deepEqual(signals(sys), [], r.out);
  assert.match(r.out, /Left pmine alone: the process tree can't be read/);
});
