// Tests for what the process registry says when it skips a registry on a machine more than one account uses (#231,
// review round 1 of #251): start never tells the agent to delete the home folder, the repo or a folder above it;
// each kind of folder gets its own fix; and list, ps and doctor name the rare skips too. On the fake machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, chownSync, lstatSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmp } from "./helpers.mjs";
import { processChecks } from "../src/project-checks.mjs";
import { STALE, fakeSys, homeUnder, homeWith, inRepo, ownedBy, repoAt, run, seed, startDev } from "./procs-fake.mjs";

const posix = { skip: process.platform === "win32" ? "Windows has no POSIX owner or mode" : false };
const OWN = { owned: true, writers: [] };
const CANT_TELL = "file system, whose ACLs getfacl and ls don't show, so who else can write it can't be told";
const HOME_OFF = "the home registry and the index stay off, while a repo in folders only you can write still tracks its processes";
const DOCTOR_FIX = "Do what it says: until then its processes aren't listed or stopped, and a repo moved to another file system or cloned again starts with no records";
// Doctor's line for a home folder that is how the machine is set up: there is nothing to do.
const SET_UP = "Nothing to fix: this is how the machine is set up. Start background processes from inside a repo, whose own registry still lists and stops them";

// start's one line for a registry it refuses, and that it started nothing.
async function startLine(sys) {
  const r = await startDev(sys);
  assert.equal(r.code, 1);
  assert.ok(!sys.calls.some((c) => c.startsWith("spawn")), "nothing started");
  return r.out.trim();
}
const refused = (why, next) => `Nothing started: the registry can't be used (${why}). ${next}`;
const DO_IT = "Do what it says, or ask the person.";

// list, ps and doctor each name the skip, and doctor's fix never says the records are kept.
async function named(sys, why, fix = DOCTOR_FIX) {
  for (const argv of [["list"], ["ps"]]) {
    assert.ok((await run(sys, argv)).out.includes(`Not read: ${why}. Until then its processes aren't listed or stopped.`), `${argv[0]}: ${why}`);
  }
  assert.deepEqual(processChecks(sys.cwd, { sys }).find((c) => c.label === `Process registry not read: ${why}`)?.fix, fix, why);
}

test("#231: WHEN the home folder is on NFS THEN start, list, ps and doctor say the home registry and the index stay off, and where processes are still tracked", posix, async () => {
  const sys = homeWith({ fsType: (dir) => (dir === sys.home ? "nfs4" : "ext4") });
  const why = `${sys.home} is on a nfs4 ${CANT_TELL}: the home registry and the index stay off on this machine, while a repo on a local Linux file system, such as ext4, still tracks its processes`;
  assert.equal(await startLine(sys), refused(why, DO_IT));
  await named(sys, why, SET_UP);
});

test("#231: WHEN a repo is on a Windows drive under WSL (9p or drvfs) THEN the fix is to keep it inside the Linux file system, where its records start fresh", posix, async () => {
  for (const type of ["9p", "drvfs"]) {
    const root = join(tmp("procs-above-"), "repo");
    const sys = repoAt(root, { fsType: (dir) => (dir === root ? type : "ext4") });
    const why = `${root} is on a ${type} ${CANT_TELL}: keep the repo inside the Linux file system, for example under ~, not on a Windows drive under /mnt; its records start fresh there`;
    assert.equal(await startLine(sys), refused(why, DO_IT));
    await named(sys, why);
  }
});

test("#231: WHEN a repo is on NFS, or a file system that can't be named THEN the fix is a local Linux file system, where its records start fresh", posix, async () => {
  for (const [type, a] of [["nfs4", "a nfs4"], [null, "an unknown"]]) {
    const root = join(tmp("procs-above-"), "repo");
    const sys = repoAt(root, { fsType: (dir) => (dir === root ? type : "ext4") });
    const why = `${root} is on ${a} ${CANT_TELL}: move the repo onto a local Linux file system, such as ext4, xfs or btrfs; its records start fresh there`;
    assert.equal(await startLine(sys), refused(why, DO_IT));
    await named(sys, why);
  }
});

test("#231: WHEN a folder above the repo belongs to another user THEN start says to do what the reason says, never to delete a folder", posix, async () => {
  const above = tmp("procs-above-");
  const sys = repoAt(join(above, "repo"), { lstat: ownedBy(above, 4242) });
  const why = `${above}, above ${sys.cwd}, belongs to another user: use a repo in a folder only you can write`;
  assert.equal(await startLine(sys), refused(why, DO_IT));
  await named(sys, why);
});

test("#231: WHEN the home folder belongs to another user THEN start, list, ps and doctor name it, and start never says to delete it", posix, async () => {
  const sys = homeWith();
  sys.lstat = ownedBy(sys.home, 4242);
  const why = `the home folder ${sys.home} belongs to another user: ${HOME_OFF}`;
  assert.equal(await startLine(sys), refused(why, DO_IT));
  await named(sys, why, SET_UP);
});

test("#231: WHEN a folder above the home folder belongs to another user THEN start, list, ps and doctor say the home registry and the index stay off", posix, async () => {
  const sys = homeUnder();
  const above = dirname(sys.home);
  sys.lstat = ownedBy(above, 4242);
  const why = `${above}, above ${sys.home}, belongs to another user: ${HOME_OFF}`;
  assert.equal(await startLine(sys), refused(why, DO_IT));
  await named(sys, why, SET_UP);
});

test("#231: WHEN a symlink on the way to the repo belongs to another user THEN start, list, ps and doctor name it and say to use the real path", posix, async () => {
  const real = tmp("procs-real-"), lobby = tmp("procs-lobby-");
  const sys = repoAt(join(real, "repo"));
  chmodSync(lobby, 0o1777);
  symlinkSync(real, join(lobby, "dir"));
  sys.cwd = join(lobby, "dir", "repo");
  sys.lstat = ownedBy(join(lobby, "dir"), 4242);
  const why = `${join(lobby, "dir")}, on the way to ${sys.cwd}, is a symlink another user owns, so where it leads can't be trusted: open the repo by its real path`;
  assert.equal(await startLine(sys), refused(why, DO_IT));
  await named(sys, why);
});

// A Windows machine whose home registry holds a stale record, with this ACL on the home folder.
function windowsHome(acl) {
  const sys = fakeSys({ platform: "win32", procs: { 4000: {} }, winAcl: (path) => (path === sys.home ? acl : OWN) });
  seed(sys, { ...STALE, group: false });
  return sys;
}

test("#231: WHEN another account can write a Windows home folder THEN start says to take that access away, never to delete it or to keep the repo in it", async () => {
  const sys = windowsHome({ owned: true, writers: ["S-1-5-11"] });
  const why = `the home folder ${sys.home} can be written by other accounts (S-1-5-11): take their write access away, or the home registry and the index stay off`;
  assert.equal(await startLine(sys), refused(why, DO_IT));
  await named(sys, why);
});

test("#231: WHEN a Windows home folder belongs to another account, or its ACL can't be read THEN list, ps and doctor name it, and start never says to delete it", async () => {
  for (const [acl, why] of [
    [{ owned: false, writers: [] }, (home) => `the home folder ${home} belongs to another account: ${HOME_OFF}`],
    [null, (home) => `who can write the home folder ${home} can't be read, so its owner can't be checked: ${HOME_OFF}`],
  ]) {
    const sys = windowsHome(acl);
    assert.equal(await startLine(sys), refused(why(sys.home), DO_IT));
    await named(sys, why(sys.home), SET_UP);
  }
});

test("#231: WHEN the registry's own folder is the problem THEN start names that folder to delete; a chmod still says to start again", posix, async () => {
  const sys = fakeSys();
  const dir = join(sys.home, ".onrails");
  symlinkSync(tmp("procs-elsewhere-"), dir);
  assert.equal(await startLine(sys), refused(`${dir} is a symlink or not a folder`, `Delete ${dir} or ask the person.`));
  const home = homeWith();
  chmodSync(home.home, 0o777);
  assert.equal(await startLine(home), refused(`others can write the home folder ${home.home}: run chmod o-w ${home.home}`, "Then start it again."));
});

test("#231: WHEN start refuses for a reason with no fix that doesn't name the .onrails folder THEN it says to ask the person, and names no folder to delete", posix, async () => {
  const root = join(tmp("procs-above-"), "repo");
  const denied = (p) => { if (p === root) throw Object.assign(new Error("denied"), { code: "EACCES" }); return lstatSync(p); };
  const unread = repoAt(root, { lstat: denied });
  assert.equal(await startLine(unread), refused(`the folders on the way to ${root} can't be read (EACCES)`, "Ask the person."));
  const untold = repoAt(join(tmp("procs-above-"), "repo"), { git: inRepo(null) });
  assert.equal(await startLine(untold), refused(`git ls-files failed in ${untold.cwd}, so it can't tell whether a branch wrote its .onrails folder`, "Ask the person."));
});

test("#231: WHEN the repo belongs to another user THEN start says to ask the person (as root only: it needs chown)", posix, async (t) => {
  if (process.getuid?.() !== 0) return t.skip("chown to another user needs root");
  const sys = repoAt(join(tmp("procs-above-"), "repo"));
  sys.uid = 1000; // this user is not root here: the repo stays root's, and its .onrails becomes this user's
  for (const p of [".onrails", ".onrails/logs", ".onrails/procs.json"]) chownSync(join(sys.cwd, p), 1000, 0);
  assert.equal(await startLine(sys), refused(`the repo at ${sys.cwd} belongs to another user`, "Ask the person."));
});
