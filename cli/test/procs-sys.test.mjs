// Tests for the machine the process registry asks about groups and ACLs (#156, review round 3): procs-sys.mjs.
// Only the parsers and the platform switch run here; no signal is sent and no process is started but ls or getfacl.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { hasAcl, realSys, soleMember } from "../src/procs-sys.mjs";
import { tmp } from "./helpers.mjs";

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
  const version = spawnSync("ls", ["--version"], { encoding: "utf8" }).stdout ?? "";
  if (!version.startsWith("ls (GNU coreutils)")) return t.skip("no GNU ls here");
  assert.equal(realSys().acl(tmp("procs-sys-")), false);
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
