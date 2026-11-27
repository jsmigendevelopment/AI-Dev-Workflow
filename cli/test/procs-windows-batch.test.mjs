// Tests for #248: on Windows a process registry command starts PowerShell once for every ACL it needs, and once for
// the process list and the process info. Windows is a fake: realSys({ platform: "win32" }) with a fake run that
// answers PowerShell and git and counts the starts. No process is started and no signal is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, win32 } from "node:path";
import { realSys, windowsProcs } from "../src/procs-sys.mjs";
import { localRegistry } from "../src/procs-store.mjs";
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

function registryAt(root, rec) {
  const file = join(root, ".onrails", "procs.json");
  mkdirSync(join(root, ".onrails", "logs"), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ version: 1, procs: [rec] }), { mode: 0o600 });
  stamp(file);
  return file;
}

/**
 * A fake Windows machine with three repos, each under a folder of its own, all in the index. acl(path) gives the
 * rule lines after the owner (null: Get-Acl fails); owner(path) the owner. cut(text) can cut the output short.
 * rec(pid) is each repo's one record, procs() more live processes or other start times, as { pid: start }, read
 * again on every PowerShell start, more(repos, files) more paths for the index, and list(text) changes the process list.
 */
function windows({ acl = () => [], owner = () => ME, cut = (t) => t, rec = record, procs = () => ({}), more = () => [], list = (t) => t } = {}) {
  const home = tmp("procs-home-"), repos = [4000, 4001, 4002].map(() => join(tmp("procs-above-"), "repo"));
  mkdirSync(join(home, ".onrails"), { mode: 0o700 });
  const files = repos.map((root, i) => registryAt(root, rec(4000 + i)));
  writeFileSync(join(home, ".onrails", "procs-index.json"), JSON.stringify({ registries: [...files, ...more(repos, files)] }), { mode: 0o600 });
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
      const live = { [AGENT]: START, 4000: START, 4001: START, 4002: START, ...procs() };
      return { status: 0, stdout: list(Object.entries(live).map(([pid, start]) => `${pid}|1|${start}|2097152|1|${Number(pid) === AGENT ? "claude.exe" : "node dev"}`).join("\r\n")) };
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

test("#248 round 1: WHEN a win32 stop waits on the person and the PID goes to another process meanwhile THEN it reads the process list again and runs no taskkill", async () => {
  const LATER = "2026-11-26T09:30:00.0000000Z";
  // Another live session's record (its agent is 600), and PID 4100, which onRails didn't start.
  const other = (pid) => ({ ...record(pid), session: "s-2", agent: { pid: 600, start: START } });
  for (const target of ["4100", "p4000"]) {
    const moved = { 600: START, 4100: START };
    const w = windows({ rec: other, procs: () => moved });
    const ask = async () => { moved[target === "4100" ? 4100 : 4000] = LATER; return "y"; };
    const r = await run(w.sys, ["stop", target], { ask });
    assert.match(r.out, /belongs to another process now/, `${target}: ${r.out}`);
    assert.deepEqual(w.killed, [], `${target}: no taskkill`);
  }
});

test("#248 round 1: WHEN an index fails its checks THEN no path it lists that isn't a plain local registry path reaches the ACL reader, and nothing it lists is reaped", async () => {
  // Each one is there on this disk, so only the filter keeps it out: a path that starts with two separators (as a
  // UNC path does on Windows) and one that climbs with "..".
  const odd = (repos, files) => [`/${files[1]}`, `${repos[2]}/../repo/.onrails/procs.json`];
  let index = null;
  const w = windows({ more: odd, acl: (p) => (p === index ? [`Allow S-1-5-11 ${MODIFY}`] : []) });
  index = join(w.home, ".onrails", "procs-index.json");
  const r = await run(w.sys, ["session-end"]);
  const asked = w.acls().flatMap((s) => s.paths);
  assert.ok(asked.includes(index), "the index's own ACL is read");
  assert.deepEqual(asked.filter((a) => a.startsWith("//") || a.includes("/../")), [], "no path from the odd entries, or a folder of one");
  assert.deepEqual(w.reaped(), [], r.out);
  assert.deepEqual(w.killed, []);
});

test("#248 round 1: WHEN the ACL paths would overflow one Windows environment variable THEN they go in chunks under the limit, one start each, and every path is answered", () => {
  const starts = [];
  const fake = (cmd, args, opts) => {
    const paths = opts.env.ONRAILS_ACL_PATH.split("\n");
    starts.push(opts.env.ONRAILS_ACL_PATH.length);
    return { status: 0, stdout: [`user ${ME}`, ...paths.flatMap((p, i) => [`path ${i}`, `owner ${ME}`, `end ${i}`])].join("\r\n") };
  };
  const paths = Array.from({ length: 600 }, (_, i) => `C:\\${"x".repeat(100)}\\${i}\\.onrails\\procs.json`);
  const got = realSys({ platform: "win32", run: fake }).winAcls([...paths, `C:\\${"y".repeat(40000)}`]);
  assert.ok(starts.length >= 3, `${starts.length} starts`);
  assert.ok(starts.every((n) => n + "ONRAILS_ACL_PATH=".length < 32767), `sizes ${starts}`);
  assert.ok(paths.every((p) => got.get(p)?.owned === true), "every path is answered");
  assert.equal(got.get(`C:\\${"y".repeat(40000)}`), null, "a path longer than a chunk can't be told");
});

test("#248 round 2: WHEN a command line in the win32 process list holds a line break and a line for a recorded PID THEN that PID's start time can't be told, and stop runs no taskkill", async () => {
  // PID 4000 went to a newer process; 4100's command line carries a line that would give 4000 the record's start time.
  const LATER = "2026-11-26T09:30:00.0000000Z";
  const list = (t) => `${t.replace(`4000|1|${START}|`, `4000|1|${LATER}|`)}\r\n4100|1|${START}|2097152|1|node x\r\n4000|1|${START}|2097152|1|node dev`;
  const w = windows({ list });
  assert.equal(w.sys.info([4000]), null, "a PID on two lines can't be told");
  const r = await run(w.sys, ["stop", "p4000"], { ask: async () => "y" });
  assert.deepEqual(w.killed, [], r.out);
  const script = w.starts.find((s) => s.script.includes("Win32_Process")).script;
  assert.ok(script.includes("-replace '[\\r\\n]', ' '"), "PowerShell turns CR and LF in a command line into spaces");
});

test("#248 round 2: WHEN a win32 command line holds another line-ending character THEN the process is still listed, with that command line", () => {
  const rows = windowsProcs(`4000|1|${START}|2048|3|node a\u2028b\u2029c\u0085d`);
  assert.deepEqual(rows, [{ pid: 4000, ppid: 1, start: START, cpu: "3 s CPU", mem: 2, args: "node a\u2028b\u2029c\u0085d" }]);
});

test("#248 round 2: WHEN the index lists a path THEN only a plain registry path on a local drive is peeked, on Windows and POSIX", () => {
  const ok = ["C:\\a\\.onrails\\procs.json", "d:\\Users\\me\\repo\\.onrails\\procs.json"];
  const bad = ["\\\\srv\\share\\.onrails\\procs.json", "//srv/share/.onrails/procs.json", "\\\\?\\C:\\a\\.onrails\\procs.json",
    "\\\\.\\C:\\a\\.onrails\\procs.json", "\\a\\.onrails\\procs.json", "C:a\\.onrails\\procs.json", "C:\\a\\..\\b\\.onrails\\procs.json",
    "C:/a/.onrails/procs.json", "C:\\a\\\\.onrails\\procs.json", "C:\\\\a\\.onrails\\procs.json", "C:\\a\\.onrails\\other.json"];
  for (const p of ok) assert.equal(localRegistry(p, win32), true, p);
  for (const p of bad) assert.equal(localRegistry(p, win32), false, p);
  assert.equal(localRegistry("/home/me/repo/.onrails/procs.json"), process.platform !== "win32");
  for (const p of ["//srv/repo/.onrails/procs.json", "/home/me/../me/.onrails/procs.json", "home/.onrails/procs.json"]) assert.equal(localRegistry(p), false, p);
});

test("AC-267-1: WHEN a peeked registry path has a link on the way, at any folder from the root down THEN that path and the folders below the link are left out of the ACL batch", async () => {
  // A link (as a junction is on Windows) high up, to a repo's folder above, and one at the registry's own folder.
  const links = [];
  const more = (repos) => {
    const high = join(tmp("procs-link-"), "via"), low = join(tmp("procs-link-"), "repo");
    symlinkSync(dirname(repos[0]), high);
    mkdirSync(low);
    symlinkSync(join(repos[1], ".onrails"), join(low, ".onrails"));
    links.push(high, join(low, ".onrails"));
    return [join(high, "repo", ".onrails", "procs.json"), join(low, ".onrails", "procs.json")];
  };
  const w = windows({ more });
  const r = await run(w.sys, ["session-end"]);
  const asked = w.acls()[0].paths;
  assert.deepEqual(asked.filter((a) => links.some((l) => a === l || a.startsWith(`${l}/`))), [], "no link, and nothing below one, is asked");
  assert.ok(asked.includes(w.files[0]), r.out);
});
