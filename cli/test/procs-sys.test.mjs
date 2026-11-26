// Tests for the machine the process registry asks about groups and ACLs (#156, review round 3): procs-sys.mjs.
// Only the parsers, the platform switch and how git is started run here; no signal is sent and no process is started
// but ls, getfacl, git (#215) and the test's own fake git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs, { existsSync, readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { delimiter, join } from "node:path";
import { hasAcl, realSys, soleMember } from "../src/procs-sys.mjs";
import { checkPath, fake, put, safeEnv, tmp, unixOnly } from "./helpers.mjs";

const SYS = new URL("../src/procs-sys.mjs", import.meta.url).href;

const GNU = "ls (GNU coreutils) 9.4\nCopyright (C) 2023 Free Software Foundation, Inc.\n";

test("AC-156-4: an ACL is found from getfacl's output, or GNU ls's +, and anything unclear can't tell", () => {
  assert.equal(hasAcl({ getfacl: "" }), false, "getfacl --skip-base prints nothing: no ACL");
  assert.equal(hasAcl({ getfacl: "\n" }), false);
  assert.equal(hasAcl({ getfacl: "# file: /repo\n# owner: alice\n# group: alice\nuser::rwx\nuser:bob:rwx\nmask::rwx\n" }), true);
  assert.equal(hasAcl({ getfacl: null }), null, "getfacl failed");
  assert.equal(hasAcl({ getfacl: "something else\n" }), null, "output it doesn't know");
  assert.equal(hasAcl({ ls: "drwxrwxr-x  2 alice alice 4096 Nov 26 10:00 /repo\n", lsVersion: GNU }), false);
  assert.equal(hasAcl({ ls: "drwxrwxr-x. 2 alice alice 4096 Nov 26 10:00 /repo\n", lsVersion: GNU }), false, "an SELinux context, no ACL");
  assert.equal(hasAcl({ ls: "drwxrwxr-x+ 2 alice alice 4096 Nov 26 10:00 /repo\n", lsVersion: GNU }), true);
  assert.equal(hasAcl({ ls: "drwxrwxr-x  2 alice alice 4096 Nov 26 10:00 /repo\n", lsVersion: "BusyBox v1.36.1\n" }), null, "not GNU ls: no + to trust");
  assert.equal(hasAcl({ ls: "drwxrwxr-x  2 alice alice 4096 Nov 26 10:00 /repo\n", lsVersion: null }), null);
  assert.equal(hasAcl({ ls: null, lsVersion: GNU }), null, "ls failed");
  assert.equal(hasAcl({ ls: "total 0\n", lsVersion: GNU }), null, "odd output");
  assert.equal(hasAcl({}), null, "no tool at all");
});

// #233: the path goes after --, so a path that starts with - is never read as a flag. The machine only says which
// tools are there (existsSync, the edge procs-sys.mjs looks them up with), so both getfacl and ls are asked here.
test("AC-233-2: WHEN the ACL reader runs getfacl or ls THEN -- comes before the path", () => {
  const exists = fs.existsSync;
  for (const getfacl of [true, false]) {
    const ran = [];
    const run = (cmd, args) => (ran.push([cmd, ...args]), { status: 0, stdout: "" });
    fs.existsSync = (p) => p === "/usr/bin/ls" || (getfacl && p === "/usr/bin/getfacl");
    syncBuiltinESMExports();
    try { realSys({ platform: "linux", run }).acl("-rf"); } finally { fs.existsSync = exists; syncBuiltinESMExports(); }
    const want = getfacl ? [["/usr/bin/getfacl", "--skip-base", "--absolute-names", "--", "-rf"]] : [["/usr/bin/ls", "-ld", "--", "-rf"], ["/usr/bin/ls", "--version"]];
    assert.deepEqual(ran, want, getfacl ? "getfacl" : "ls");
  }
});

test("AC-156-4: off Linux, the real machine can't tell whether a group is private or a folder has an ACL", () => {
  const dir = tmp("procs-sys-");
  const gid = process.getgid?.() ?? 0;
  for (const platform of ["darwin", "freebsd", "win32"]) {
    const sys = realSys({ platform });
    assert.equal(sys.privateGroup(gid), null, platform);
    assert.equal(sys.acl(dir), null, platform);
  }
});

test("AC-156-4: on Linux with GNU ls, the real machine says a fresh folder has no ACL", (t) => {
  if (process.platform !== "linux") return t.skip("Linux only");
  const version = spawnSync("ls", ["--version"], { encoding: "utf8", env: safeEnv() }).stdout ?? "";
  if (!version.startsWith("ls (GNU coreutils)")) return t.skip("no GNU ls here");
  assert.equal(realSys().acl(tmp("procs-sys-")), false);
});

// #233: hasAcl's getfacl answer, checked against the real tool. A folder with only a default ACL (what new files in
// it inherit) has an ACL; a fresh folder has none. Skipped off Linux, where getfacl or setfacl is missing, or where
// the file system takes no ACL; any other setfacl failure fails (noAclHere).
test("AC-233-3: WHEN getfacl is on the machine THEN a real run on a folder with only a default ACL gives the answer the parser expects", (t) => {
  if (process.platform !== "linux") return t.skip("Linux only");
  const find = (name) => [`/usr/bin/${name}`, `/bin/${name}`].find((p) => existsSync(p));
  const getfacl = find("getfacl"), setfacl = find("setfacl");
  if (!getfacl || !setfacl) return t.skip("no getfacl or setfacl here");
  const plain = tmp("procs-acl-"), shared = tmp("procs-acl-");
  const set = spawnSync(setfacl, ["-d", "-m", "u::rwx,g::rwx,o::---", "--", shared], { encoding: "utf8", env: safeEnv() });
  const noAcl = noAclHere(set);
  if (noAcl) return t.skip(noAcl);
  assert.equal(realSys().acl(shared), true, "a default ACL is an ACL");
  assert.equal(realSys().acl(plain), false, "the control: a fresh folder has none");
});

// Round 1 of #244: AC-233-3 skips on setfacl's answer only when the file system takes no ACL (EOPNOTSUPP). A wrong
// flag, a usage error or a permission error fails with setfacl's stderr, so the check can't turn into a silent skip.
function noAclHere(set) {
  const why = String(set.stderr || set.error || "").trim();
  if (set.status !== 0 && /Operation not supported/.test(why)) return `this file system takes no ACL: ${why}`;
  assert.equal(set.status, 0, `setfacl failed: ${why}`);
  return null;
}

test("AC-233-3: WHEN setfacl fails for any reason but a file system without ACLs THEN the real getfacl check fails with setfacl's stderr, never skips", () => {
  assert.equal(noAclHere({ status: 0, stderr: "" }), null, "setfacl worked: the check runs");
  const nope = noAclHere({ status: 1, stderr: "setfacl: /tmp/procs-acl-x: Operation not supported\n" });
  assert.equal(nope, "this file system takes no ACL: setfacl: /tmp/procs-acl-x: Operation not supported");
  for (const stderr of ["setfacl: invalid option -- 'q'\nTry `setfacl --help' for more information.\n", "setfacl: /tmp/procs-acl-x: Permission denied\n"]) {
    assert.throws(() => noAclHere({ status: 1, stderr }), (e) => e instanceof assert.AssertionError && e.message.includes(stderr.trim()), stderr);
  }
  assert.throws(() => noAclHere({ status: null, stderr: null, error: new Error("spawnSync /usr/bin/setfacl EACCES") }), /EACCES/, "it didn't start");
});

test("AC-156-4: a group isn't the user's own when getent passwd lists another user in it, and can't tell when getent can't list", () => {
  const passwd = "root:x:0:0::/root:/bin/sh\nalice:x:1000:1000::/home/alice:/bin/bash\n";
  const ask = (more) => soleMember(1000, "alice", { group: "alice:x:1000:\n", passwd, getent: null, ...more });
  assert.equal(ask({}), true, "no getent: /etc/passwd alone");
  assert.equal(ask({ getentPasswd: passwd }), true);
  assert.equal(ask({ getentPasswd: `${passwd}dave:*:1500:1000:LDAP user:/home/dave:/bin/sh\n` }), false, "a directory user in the group");
  assert.equal(ask({ getentPasswd: null }), null, "getent is there but failed");
  assert.equal(ask({ passwd: null }), null, "no /etc/passwd and no getent");
  assert.equal(ask({ passwd: null, getentPasswd: passwd }), true, "getent alone");
});

// #215 review round 1: the default run is spawnSync, which looks a bare name up from the spawn's working folder (on
// Linux through a relative PATH entry; on Windows that folder comes before PATH). The registry asks git about every
// repo in its index, so git gets -C <folder> and runs from the current folder, as before #215. Otherwise a git that
// one repo commits could run from a session in another folder.
test("#215 round 1: WHEN the default realSys asks git about a folder THEN a git in a relative PATH entry under that folder never runs", unixOnly, () => {
  const target = tmp("procs-target-"), here = tmp("procs-here-");
  const log = join(tmp(), "git.log");
  for (const [dir, who] of [[target, "target"], [here, "current"]]) fake(join(dir, "rel"), "git", `#!/bin/sh\necho "${who} $*" >> '${log}'\n`);
  const script = `import { realSys } from ${JSON.stringify(SYS)};\nrealSys().git(${JSON.stringify(target)}, ["rev-parse", "--git-common-dir"]);`;
  const env = checkPath({ ...safeEnv(), PATH: `rel${delimiter}${safeEnv().PATH}` }, here);
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: here, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
  assert.doesNotMatch(calls, /^target/m, "the target folder's git never runs");
  // The control: the relative entry is live, read from the current folder, with the target folder as -C.
  assert.equal(calls, `current -C ${target} rev-parse --git-common-dir\n`);
});

test("#215 round 1: on a fake Windows, the default realSys never makes the target folder git's working folder, which Windows searches first", () => {
  const target = tmp("procs-target-");
  put(target, "git.exe", "a git the repo commits\n");
  const ran = [];
  // spawnSync's lookup of a bare name on Windows: the spawn's working folder first, then PATH.
  const run = (cmd, args, opts) => {
    const first = join(opts.cwd ?? process.cwd(), `${cmd}.exe`);
    ran.push([existsSync(first) ? first : cmd, ...args]);
    return { status: 0, stdout: ".git\n" };
  };
  assert.equal(realSys({ platform: "win32", run }).git(target, ["rev-parse", "--git-common-dir"]), ".git");
  assert.deepEqual(ran, [["git", "-C", target, "rev-parse", "--git-common-dir"]]);
});

// #174, from the round 2 review of #223: fullPath means the run found the full path itself. Without a run, the
// default spawnSync would start a bare git in the target folder, which Windows searches first.
test("#174: WHEN realSys gets fullPath without a run THEN it throws, so no bare git runs in the target folder", () => {
  assert.throws(() => realSys({ fullPath: true }), /fullPath needs the run that found the full path/);
  assert.throws(() => realSys({ platform: "win32", fullPath: true }), /fullPath needs the run/);
  const ran = [];
  const sys = realSys({ fullPath: true, run: (cmd, args, opts) => (ran.push([cmd, args, opts.cwd]), { status: 0, stdout: ".git\n" }) });
  assert.equal(sys.git("/repo", ["rev-parse", "--git-common-dir"]), ".git");
  assert.deepEqual(ran, [["git", ["rev-parse", "--git-common-dir"], "/repo"]], "with its run, as doctor calls it");
  assert.equal(typeof realSys().git, "function", "the default still needs no run");
});
