// Tests for #248: on Windows a process registry command starts PowerShell once for every ACL it needs, and once for
// the process list and the process info. Windows is a fake: realSys({ platform: "win32" }) with a fake run that
// answers PowerShell and git and counts the starts. No process is started and no signal is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { realSys } from "../src/procs-sys.mjs";
import { run, stamp } from "./procs-fake.mjs";
import { tmp } from "./helpers.mjs";

const ME = "S-1-5-21-1-2-3-1001";
const START = "2026-11-26T09:00:00.0000000Z";
const AGENT = 500;
const MODIFY = 1245631; // Authenticated Users under C:\: write, and delete
const MAKE_FOLDERS = 4; // what every signed-in user has on C:\ itself: make a folder, never rename or remove one

// A record of this session's for pid, alive, so session-end hands it to a reaper.
const record = (pid) => ({ id: `p${pid}`, kind: "process", pid, start: START, group: false, command: "pnpm dev", why: "w", until: "u",
  session: "s-1", agent: { pid: AGENT, start: START }, startedAt: START });

function registryAt(root, pid) {
  const file = join(root, ".onrails", "procs.json");
  mkdirSync(join(root, ".onrails", "logs"), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ version: 1, procs: [record(pid)] }), { mode: 0o600 });
  stamp(file);
  return file;
}

/**
 * A fake Windows machine with three repos, each under a folder of its own, all in the index. acl(path) gives the
 * rule lines after the owner (null: Get-Acl fails); owner(path) the owner. cut(text) can cut the output short.
 */
function windows({ acl = () => [], owner = () => ME, cut = (t) => t } = {}) {
  const home = tmp("procs-home-"), repos = [4000, 4001, 4002].map(() => join(tmp("procs-above-"), "repo"));
  mkdirSync(join(home, ".onrails"), { mode: 0o700 });
  const files = repos.map((root, i) => registryAt(root, 4000 + i));
  writeFileSync(join(home, ".onrails", "procs-index.json"), JSON.stringify({ registries: files }), { mode: 0o600 });
  const starts = [], spawned = [], killed = [];
  const fakeRun = (cmd, args, opts) => {
    if (cmd === "git") {
      const [, dir, ...rest] = args;
      if (!repos.includes(dir)) return { status: 128, stdout: "", stderr: "not a repo" };
      return { status: 0, stdout: rest[0] === "ls-files" ? "" : ".git\n" };
    }
    if (cmd === "taskkill") return (killed.push(args[1]), { status: 0, stdout: "" });
    if (cmd !== "powershell.exe") return { status: 1, stdout: "", stderr: "no such tool" };
    const script = args.at(-1), paths = opts.env?.ONRAILS_ACL_PATH?.split("\n") ?? [];
    starts.push({ script, args, paths });
    if (script.includes("Win32_Process")) {
      const row = (pid, parent, line) => `${pid}|${parent}|${START}|2097152|1|${line}`;
      return { status: 0, stdout: [row(AGENT, 1, "claude.exe"), ...[4000, 4001, 4002].map((p) => row(p, 1, "node dev"))].join("\r\n") };
    }
    const block = (p, i) => {
      const rules = acl(p);
      return rules ? [`path ${i}`, `owner ${owner(p)}`, `Allow ${ME} 2032127`, ...rules, `end ${i}`] : [`path ${i}`, `fail ${i}`];
    };
    return { status: 0, stdout: cut([`user ${ME}`, ...paths.flatMap(block)].join("\r\n")) };
  };
  const sys = Object.assign(realSys({ platform: "win32", run: fakeRun }), {
    home, cwd: tmp("procs-cwd-"), env: { CLAUDE_CODE_SESSION_ID: "s-1", CLAUDE_PID: String(AGENT) },
    stdin: async () => '{"session_id":"s-1"}',
    spawn: (argv) => (spawned.push(argv), 7000 + spawned.length),
  });
  // The registry each reaper was started for.
  const reaped = () => spawned.map((argv) => argv[argv.indexOf("--registry") + 1]);
  return { sys, home, repos, files, starts, reaped, killed, acls: () => starts.filter((s) => s.script.includes("Get-Acl")) };
}

test("AC-248-1: WHEN a win32 command needs the ACLs of several paths THEN it reads them all in one PowerShell start, with the paths in the environment, never on the command line", async () => {
  const w = windows();
  const r = await run(w.sys, ["list"]);
  assert.equal(w.acls().length, 1, r.out);
  const [{ paths, args }] = w.acls();
  const root = w.repos[0], file = w.files[0];
  for (const want of [file, dirname(file), join(dirname(file), "logs"), join(w.home, ".onrails"), join(w.home, ".onrails", "procs-index.json"), root, w.home]) {
    assert.ok(paths.includes(want), `asks for ${want}`);
  }
  assert.ok(!args.some((a) => paths.some((p) => a.includes(p))), "no path reaches the command line");
});

test("AC-248-2: WHEN session-end runs on a fake win32 machine with three registries in the index THEN it starts PowerShell at most twice, and still signals nothing a registry it refused holds", async () => {
  const w = windows({ acl: (p) => (p === w.repos[2] ? [`Allow S-1-5-11 ${MODIFY}`] : []) });
  const r = await run(w.sys, ["session-end"]);
  assert.ok(w.starts.length <= 2, `${w.starts.length} PowerShell starts: ${r.out}`);
  assert.equal(w.acls().length, 1);
  assert.deepEqual(w.reaped(), [w.files[0], w.files[1]], r.out);
  assert.deepEqual(w.killed, []);
});

test("AC-248-3: WHEN the batched reader can't read one path THEN only that path counts as \"can't tell\", and nothing under it is read for a signal", async () => {
  const w = windows({ acl: (p) => (p === dirname(w.repos[1]) ? null : []) });
  const r = await run(w.sys, ["session-end"]);
  assert.deepEqual(w.reaped(), [w.files[0], w.files[2]], r.out);
  assert.deepEqual(w.killed, []);
});

test("AC-248-3: WHEN the batched reader's output is cut short THEN only the path it cut counts as \"can't tell\"", async () => {
  // The last block loses its end line: the last registry's own file, so only that registry is off.
  const w = windows({ cut: (t) => t.replace(/\r\nend \d+$/, "") });
  const r = await run(w.sys, ["session-end"]);
  assert.equal(w.acls()[0].paths.at(-1), w.files[2], "the last path asked is the last registry's file");
  assert.deepEqual(w.reaped(), [w.files[0], w.files[1]], r.out);
});

test("AC-248-4: WHEN the ACLs come in one batch THEN the folders above a Windows repo root are read too, and none may be changed by another account", async () => {
  const above = (i) => (w) => dirname(w.repos[i]);
  const cases = [
    ["another account can rename or remove what is in it", above(1), { acl: [`Allow S-1-5-11 ${MODIFY}`] }, [0, 2]],
    ["another account owns it", above(1), { owner: "S-1-5-21-1-2-3-1002" }, [0, 2]],
    ["the system folder: everyone may make a folder in it, TrustedInstaller owns it", above(1),
      { acl: [`Allow S-1-5-11 ${MAKE_FOLDERS}`], owner: "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464" }, [0, 1, 2]],
  ];
  for (const [name, which, odd, want] of cases) {
    let bad = null;
    const w = windows({ acl: (p) => (p === bad && odd.acl ? odd.acl : []), owner: (p) => (p === bad && odd.owner ? odd.owner : ME) });
    bad = which(w);
    const r = await run(w.sys, ["session-end"]);
    assert.ok(w.acls()[0].paths.includes(bad), `${name}: the folder above is asked`);
    assert.deepEqual(w.reaped(), want.map((i) => w.files[i]), `${name}: ${r.out}`);
  }
});
