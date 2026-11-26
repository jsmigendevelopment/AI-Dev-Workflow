// Tests for the process registry on a machine more than one account uses (#231): every folder on the way to the
// folder that holds .onrails (the repo root, or the home folder), ~/.onrails's ACL, file systems whose ACLs can't
// be read, and Windows registries skipped for their ACL. They run on the fake machine in procs-fake.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, chownSync, lchownSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmp } from "./helpers.mjs";
import { processChecks } from "../src/project-checks.mjs";
import { mountType, realSys } from "../src/procs-sys.mjs";
import { STALE, fakeSys, hit, homeUnder, homeWith, ownedBy, repoAt, repoFile, run, runAll, seed, signals, startDev, stopped } from "./procs-fake.mjs";

const posix = { skip: process.platform === "win32" ? "Windows has no POSIX owner or mode" : false };
const STOPS = [["stop", "stale"], ["stop", "all", "--yes"], ["stop", "p0bad", "--yes"], ["ps", "--stop", "all", "--yes"], ["session-end"]];
// What reaches both the home registry's record and the index's: no single id.
const EVERY = [["stop", "stale"], ["stop", "all", "--yes"], ["ps", "--stop", "all", "--yes"]];

test("AC-231-1: WHEN a folder above the repo root can be written by another user THEN the repo registry is never read for a signal", posix, async () => {
  const cases = [
    // [the folder above's mode, the user is its group's one member, its ACL, signalled]
    [0o755, false, false, true],
    [0o775, false, false, false], // a shared group under a 002 umask, as macOS staff gives
    [0o775, null, false, false],
    [0o2775, false, false, false],
    [0o775, true, false, true],
    [0o775, true, true, false],
    [0o775, true, null, false],
    [0o1775, false, false, true], // sticky: nobody else can rename or remove what is in it
    [0o777, false, false, false],
    [0o1777, false, false, true],
  ];
  for (const [mode, sole, acl, signalled] of cases) {
    for (const argv of STOPS) {
      const above = tmp("procs-above-");
      const sys = repoAt(join(above, "repo"), { privateGroup: sole, acl });
      chmodSync(above, mode);
      await runAll(sys, argv);
      assert.equal(stopped(sys), signalled, `above ${mode.toString(8)}, sole member ${sole}, ACL ${acl}, ${argv.join(" ")}`);
    }
  }
  assert.match(repoFile("docs/decisions.md"), /^\| \d+ \| 2026-11-26 \| How #231 /m, "the stance is a decision row");
});

test("AC-231-1: the check walks every folder up to the filesystem root, and follows each symlink on the way", posix, async () => {
  const top = tmp("procs-top-");
  const deep = repoAt(join(top, "a", "b", "repo"));
  chmodSync(top, 0o777);
  await run(deep, ["stop", "stale"]);
  assert.equal(stopped(deep), false, "three folders up");
  for (const [shared, front, signalled] of [[0o755, 0o700, true], [0o777, 0o700, false], [0o755, 0o777, false]]) {
    // The repo is reached through a link in a front folder, pointing into another folder.
    const real = join(tmp("procs-real-"), "shared");
    const sys = repoAt(join(real, "repo"));
    const lobby = tmp("procs-front-");
    symlinkSync(real, join(lobby, "dir"));
    sys.cwd = join(lobby, "dir", "repo");
    chmodSync(real, shared);
    chmodSync(lobby, front);
    await run(sys, ["stop", "stale"]);
    assert.equal(stopped(sys), signalled, `the link's target ${shared.toString(8)}, its folder ${front.toString(8)}`);
  }
});

test("AC-231-1: WHEN a folder above the repo belongs to another user THEN its registry is never read (as root only: it needs chown)", posix, async (t) => {
  if (process.getuid?.() !== 0) return t.skip("chown to another user needs root");
  const above = tmp("procs-above-");
  const sys = repoAt(join(above, "repo"));
  sys.uid = 1000; // this user is not root here, so a folder of root's still passes
  chownSync(join(above, "repo"), 1000, 0);
  chownSync(join(above, "repo", ".onrails"), 1000, 0);
  chownSync(join(above, "repo", ".onrails", "logs"), 1000, 0);
  chownSync(join(above, "repo", ".onrails", "procs.json"), 1000, 0);
  await run(sys, ["stop", "stale"]);
  assert.equal(stopped(sys), true, "root's folders above, and this user's below: read");
  const other = repoAt(join(tmp("procs-above-"), "repo"));
  chownSync(join(other.cwd, ".."), 4242, 4242);
  await run(other, ["stop", "stale"]);
  assert.equal(stopped(other), false, "another user's folder above");
});

// A repo reached through a link named dir in a folder of the given mode (sticky as /tmp, or not).
function throughLink(mode) {
  const real = tmp("procs-real-"), lobby = tmp("procs-lobby-");
  const sys = repoAt(join(real, "repo"));
  chmodSync(lobby, mode);
  symlinkSync(real, join(lobby, "dir"));
  sys.cwd = join(lobby, "dir", "repo");
  return { sys, real, link: join(lobby, "dir") };
}

test("AC-231-1: WHEN a symlink on the way to the repo belongs to another user THEN its registry is never read, sticky folder or not", posix, async () => {
  for (const mode of [0o1777, 0o755]) {
    for (const [owner, signalled] of [[4242, false], [process.getuid(), true], [0, true]]) {
      const { sys, link } = throughLink(mode);
      sys.lstat = ownedBy(link, owner);
      await run(sys, ["stop", "stale"]);
      assert.equal(stopped(sys), signalled, `a link owned by uid ${owner} in a folder ${mode.toString(8)}`);
    }
  }
});

test("AC-231-1: WHEN a symlink in a sticky folder belongs to another user THEN its registry is never read (as root only: it needs lchown)", posix, async (t) => {
  if (process.getuid?.() !== 0) return t.skip("lchown to another user needs root");
  for (const [owner, signalled] of [[4242, false], [1000, true]]) {
    const { sys, real, link } = throughLink(0o1777);
    sys.uid = 1000; // this user is not root here, so root's folders still pass
    for (const p of ["repo", "repo/.onrails", "repo/.onrails/logs", "repo/.onrails/procs.json"]) chownSync(join(real, p), 1000, 0);
    lchownSync(link, owner, owner); // only files inside this test's own temp folders
    await run(sys, ["stop", "stale"]);
    assert.equal(stopped(sys), signalled, `a link owned by uid ${owner}`);
  }
});

test("AC-231-1: list, ps and doctor name the folder above and the chmod that fixes it, and start starts nothing", posix, async () => {
  const above = tmp("procs-above-");
  const sys = repoAt(join(above, "repo"));
  chmodSync(above, 0o775);
  const why = `the group can write ${above}, above ${sys.cwd}, and it isn't this user's alone: run chmod g-w ${above}`;
  for (const argv of [["list"], ["ps"]]) {
    assert.ok((await run(sys, argv)).out.includes(`Not read: ${why}. Until then its processes aren't listed or stopped.`), argv[0]);
  }
  assert.ok(processChecks(sys.cwd, { sys }).some((c) => c.label === `Process registry not read: ${why}`));
  const r = await startDev(sys);
  assert.equal(r.code, 1);
  assert.ok(r.out.includes(why), r.out);
  assert.ok(!sys.calls.some((c) => c.startsWith("spawn")));
});

test("AC-231-2: WHEN the home folder can be written by another account THEN the home registry and the index are never read for a signal", posix, async () => {
  for (const [mode, sole, read] of [[0o755, false, true], [0o700, false, true], [0o775, true, true], [0o775, false, false], [0o2775, null, false], [0o777, true, false], [0o1777, true, false]]) {
    for (const argv of EVERY) {
      const sys = homeWith({ privateGroup: sole });
      chmodSync(sys.home, mode);
      await runAll(sys, argv);
      assert.deepEqual(hit(sys), { home: read, index: read }, `home ${mode.toString(8)}, sole member ${sole}, ${argv.join(" ")}`);
    }
  }
  const sys = homeWith();
  chmodSync(sys.home, 0o775);
  const r = await startDev(sys);
  assert.equal(r.code, 1);
  assert.ok(r.out.includes(`the group can write the home folder ${sys.home}, and it isn't this user's alone: run chmod g-w ${sys.home}`), r.out);
  assert.ok(!sys.calls.some((c) => c.startsWith("spawn")));
});

test("AC-231-2: WHEN a folder above the home folder belongs to another account, or another account can write it THEN the home registry and the index are never read for a signal", posix, async () => {
  const cases = [
    // [the folder above's mode, the user is its group's one member, its ACL, read]
    [0o755, false, false, true],
    [0o757, false, false, false], // others can write it
    [0o775, false, false, false],
    [0o775, null, false, false],
    [0o2775, false, false, false],
    [0o775, true, false, true], // this user's own group, no one else in it, no ACL
    [0o775, true, true, false],
    [0o775, true, null, false],
    [0o1777, false, false, true], // sticky: nobody else can rename or remove what is in it
  ];
  for (const [mode, sole, acl, read] of cases) {
    for (const argv of EVERY) {
      const sys = homeUnder({ privateGroup: sole, acl });
      chmodSync(dirname(sys.home), mode);
      await runAll(sys, argv);
      assert.deepEqual(hit(sys), { home: read, index: read }, `above ~ ${mode.toString(8)}, sole member ${sole}, ACL ${acl}, ${argv.join(" ")}`);
    }
  }
  for (const [owner, read] of [[4242, false], [process.getuid(), true], [0, true]]) {
    for (const argv of EVERY) {
      const sys = homeUnder();
      sys.lstat = ownedBy(dirname(sys.home), owner);
      await runAll(sys, argv);
      assert.deepEqual(hit(sys), { home: read, index: read }, `above ~ owned by uid ${owner}, ${argv.join(" ")}`);
    }
  }
});

test("AC-231-2: WHEN a Windows home folder can be written by another account, or its ACL can't be read THEN the home registry and the index are never read for a signal", async () => {
  const OWN = { owned: true, writers: [] };
  for (const [acl, read] of [[OWN, true], [{ owned: true, writers: ["S-1-5-11"] }, false], [null, false], [{ owned: false, writers: [] }, false]]) {
    for (const argv of EVERY) {
      const sys = homeWith({ platform: "win32", winAcl: (path) => (path === sys.home ? acl : OWN) });
      await runAll(sys, argv);
      assert.deepEqual(hit(sys), { home: read, index: read }, `home ${JSON.stringify(acl)}, ${argv.join(" ")}`);
    }
  }
});

test("AC-231-3: WHEN ~/.onrails has a named-user ACL entry, or whether it has one can't be told THEN nothing in it is read for a signal", posix, async () => {
  // A named entry can only grant write through the mask, which is the group bits: with them off, no ACL is asked.
  for (const [mode, acl, read] of [[0o775, true, false], [0o770, true, false], [0o775, null, false], [0o775, false, true], [0o700, true, true]]) {
    for (const argv of EVERY) {
      const sys = homeWith({ acl });
      chmodSync(join(sys.home, ".onrails"), mode);
      await runAll(sys, argv);
      assert.deepEqual(hit(sys), { home: read, index: read }, `~/.onrails ${mode.toString(8)}, ACL ${acl}, ${argv.join(" ")}`);
    }
  }
  const sys = homeWith({ acl: true });
  chmodSync(join(sys.home, ".onrails"), 0o775);
  const dir = join(sys.home, ".onrails");
  assert.ok((await run(sys, ["list"])).out.includes(`Not read: the group can write ${dir}, and it has an ACL, or whether it has one can't be told: run chmod g-w ${dir}`));
});

test("AC-231-3: WHEN the repo root or a folder above it is on a file system whose ACLs getfacl and ls don't show (NFSv4) THEN it can't be told, and nothing is read", posix, async () => {
  for (const [type, signalled] of [["nfs4", false], ["nfs", false], ["cifs", false], ["fuse.sshfs", false], [null, false], ["ext4", true], ["xfs", true], ["btrfs", true]]) {
    for (const where of ["root", "above"]) {
      const above = tmp("procs-above-");
      const root = join(above, "repo");
      const sys = repoAt(root, { fsType: (dir) => (dir === (where === "root" ? root : above) ? type : "ext4") });
      await run(sys, ["stop", "stale"]);
      assert.equal(stopped(sys), signalled, `${where} on ${type}`);
      if (!signalled && where === "root") {
        assert.ok((await run(sys, ["list"])).out.includes(`Not read: ${root} is on ${type ? `a ${type}` : "an unknown"} file system, whose ACLs getfacl and ls don't show`));
      }
    }
  }
  const sys = homeWith({ fsType: (dir) => (dir === sys.home ? "nfs4" : "ext4") });
  await run(sys, ["stop", "stale"]);
  assert.deepEqual(hit(sys), { home: false, index: false }, "a home folder on NFSv4");
});

test("AC-231-3: the file system of a path is the type of the longest mount point in /proc/self/mountinfo that holds it", (t) => {
  const info = [
    "22 1 8:1 / / rw,relatime shared:1 - ext4 /dev/sda1 rw",
    "40 22 0:50 / /mnt/nfs rw,relatime shared:20 - nfs4 server:/export rw,vers=4.2",
    "41 40 8:2 / /mnt/nfs/inner rw - ext4 /dev/sdb1 rw",
    "42 22 0:51 / /mnt/my\\040disk rw - xfs /dev/sdc1 rw",
    "43 22 0:52 / /srv rw - ext4 /dev/sdd1 rw",
    "44 43 0:53 / /srv rw - nfs4 server:/srv rw",
  ].join("\n");
  const cases = { "/home/a": "ext4", "/mnt/nfs": "nfs4", "/mnt/nfs/x/y": "nfs4", "/mnt/nfs/inner/z": "ext4", "/mnt/nfsx": "ext4", "/mnt/my disk/r": "xfs", "/srv/x": "nfs4" };
  for (const [path, type] of Object.entries(cases)) assert.equal(mountType(info, path), type, path);
  assert.equal(mountType(null, "/"), null, "no mountinfo: can't tell");
  assert.equal(mountType("not a mount line", "/x"), null);
  assert.equal(realSys({ platform: "darwin" }).fsType("/"), undefined, "only Linux is asked");
  if (process.platform !== "linux") return t.skip("no /proc/self/mountinfo off Linux");
  assert.equal(typeof realSys().fsType(tmp("procs-fs-")), "string");
});

test("AC-231-4: WHEN a Windows registry is skipped because another account can write it THEN list, ps, session-start and doctor name it with what to do", async () => {
  const OWN = { owned: true, writers: [] };
  const sys = fakeSys({ platform: "win32", procs: { 4000: {} }, winAcl: (path) => (path === join(sys.home, ".onrails") ? { owned: true, writers: ["S-1-5-11"] } : OWN) });
  seed(sys, { ...STALE, group: false });
  const why = `${join(sys.home, ".onrails")} can be written by other accounts (S-1-5-11): keep the repo in your user folder, or take their write access away`;
  for (const argv of [["list"], ["ps"]]) {
    assert.ok((await run(sys, argv)).out.includes(`Not read: ${why}. Until then its processes aren't listed or stopped.`), argv[0]);
  }
  const start = (await run(sys, ["session-start"])).out.split("\n");
  assert.deepEqual(start.slice(0, 3), ["### A process registry was skipped (the process registry)", `- ${why}`,
    "Until then its processes aren't listed, stopped or cleaned up at session end. Tell the person in your first reply, with what it says to do."]);
  assert.deepEqual(processChecks(sys.cwd, { sys }), [{ status: "✗", required: false, label: `Process registry not read: ${why}`,
    fix: "Do what it says: until then its processes aren't listed or stopped, and a repo moved to another file system or cloned again starts with no records" }]);
  assert.deepEqual(signals(sys), []);
});
