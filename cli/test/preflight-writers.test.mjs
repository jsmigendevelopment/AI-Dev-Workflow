// #232: before the read, preflight never runs or reads from a folder another local user can write or swap: npm's temp
// folder, the repo-top search and the PATH folders it keeps. Real folders with real modes; another user's folder is
// one whose owner a fake sys reads as someone else, the same as root or not. Nothing here mounts or chowns anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathOutside, tempFolders } from "../src/preflight-layout.mjs";
import { isRead, markRead, othersCanWrite, repoTop } from "../src/preflight-sys.mjs";
import { fakes, pathWith, ran, runScript, temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "POSIX modes and shell-script fakes" : false };
const native = (path) => realpathSync.native(path);

/** A new folder with the given mode, made inside parent (a fresh temp folder by default). */
function folder(mode, parent = temp("onrails-writers-")) {
  const dir = join(parent, `m${mode.toString(8)}-${readdirSync(parent).length}`);
  mkdirSync(dir);
  chmodSync(dir, mode);
  return dir;
}

/** A fake sys that reads dir as another local user's: its owner is someone else, for root and for anyone else alike. */
function othersOwn(dir) {
  const real = native(dir);
  const other = process.getuid() === 65534 ? 65533 : 65534;
  const lstat = (path) => (path === real ? { ...lstatSync(path), uid: other } : lstatSync(path));
  return { sys: { uid: process.getuid(), gid: process.getgid(), acl: () => false, privateGroup: () => true, lstat } };
}

test("AC-232-1: WHEN preflight runs npm from its outside temp folder THEN npm reads no project or .npmrc from a folder above it", posixOnly, () => {
  // The folder the session's TMPDIR names holds a package.json and an .npmrc, as another user could leave in a shared /tmp.
  const above = temp("onrails-writers-above-");
  writeFileSync(join(above, "package.json"), "{}");
  writeFileSync(join(above, ".npmrc"), "registry=http://127.0.0.2:9/\n");
  const home = temp("onrails-writers-home-");
  writeFileSync(join(home, ".npmrc"), "registry=http://127.0.0.1:9/\n");
  const repo = temp("onrails-writers-repo-");
  const report = runScript(repo, { HOME: home, TMPDIR: above, PATH: pathWith("node", "npm") }, "--json");
  const detail = report.results.find((r) => r.id === "registry").detail;
  assert.doesNotMatch(detail, /127\.0\.0\.2/, "npm took the registry from the .npmrc above its temp folder");
  assert.match(detail, /^127\.0\.0\.1:9 didn't answer/, "npm used the person's own .npmrc");
  assert.equal(report.away, true);
  const table = runScript(repo, { HOME: home, TMPDIR: above, PATH: pathWith("node", "npm") }).stdout;
  assert.match(table, /ran from an empty temp folder outside it that only this user can write, and npm read no project settings above it/);
  // npm's own compile cache may stay there; preflight's temp folder may not.
  assert.deepEqual(readdirSync(above).filter((name) => name.startsWith("onrails-")), [], "the temp folder wasn't removed");
});

test("AC-232-1: WHEN the temp folder's base can be written by other users without the sticky bit THEN preflight makes no folder there", posixOnly, () => {
  const home = folder(0o700);
  const open = folder(0o777);
  const sticky = folder(0o1777);
  const swappable = folder(0o700, folder(0o777));
  for (const [base, used] of [[open, false], [swappable, false], [sticky, true], [home, true]]) {
    const temps = tempFolders(temp("onrails-writers-repo-"), "linux", undefined, [base, home]);
    try {
      const want = used ? base : home;
      assert.equal(dirname(temps.away.cwd), native(want), `${base}: npm would run from ${temps.away.cwd}`);
      assert.equal(dirname(temps.hooks), native(want), `${base}: git's hooks folder is in ${temps.hooks}`);
    } finally {
      temps.remove();
    }
    assert.deepEqual(readdirSync(base), [], `a folder was left in ${base}`);
  }
  // No base that only this user can write: no folder at all, so the rows that need one wait for the read.
  const none = tempFolders(temp("onrails-writers-repo-"), "linux", undefined, [open, swappable]);
  none.remove();
  assert.equal(none.away, null);
  assert.equal(none.hooks, null);
});

test("AC-232-2: WHEN repoTop() walks up from a folder THEN it stops at, and never trusts, a folder another user can write", posixOnly, () => {
  for (const mode of [0o777, 0o1777]) {
    const shared = folder(0o755);
    mkdirSync(join(shared, ".git"));
    const start = folder(0o755, shared);
    assert.equal(repoTop(start), native(shared), "the control: a folder only this user can write is trusted");
    chmodSync(shared, mode);
    assert.equal(repoTop(start), null, `mode ${mode.toString(8)}: the walk trusted a .git another user could have put there`);
  }
  // A folder above that another user can write, without the sticky bit, lets them swap the repo for one of theirs.
  const swappable = folder(0o777);
  const repo = folder(0o755, swappable);
  mkdirSync(join(repo, ".git"));
  assert.equal(repoTop(repo), null, "a repo another user could swap was trusted");
  chmodSync(swappable, 0o1777);
  assert.equal(repoTop(repo), native(repo), "the sticky bit stops the swap of a folder this user owns");
  // A folder another user owns.
  const theirs = folder(0o755);
  mkdirSync(join(theirs, ".git"));
  const { sys } = othersOwn(theirs);
  assert.equal(repoTop(theirs, { sys }), null, "another user's folder was trusted");
  assert.equal(repoTop(theirs), native(theirs), "the control: the same folder as this user's own is trusted");
  assert.match(othersCanWrite(native(theirs), { sys }), /belongs to another user/);
});

test("AC-232-2: WHEN a marked repo's folder can be written by another user THEN it no longer reads as read, and --mark-read refuses it", posixOnly, () => {
  const repo = folder(0o755);
  mkdirSync(join(repo, ".git"));
  assert.equal(markRead(repo), native(repo));
  assert.equal(isRead(repo), true, "the control: the marked repo reads as read");
  chmodSync(repo, 0o777);
  assert.equal(isRead(repo), false, "a repo another user can write still read as read");
  assert.equal(markRead(repo), null, "--mark-read marked a repo another user can write");
});

test("AC-232-3: WHEN a PATH folder outside the repo can be written by another local user THEN preflight leaves it off PATH, as it does a folder inside the repo", posixOnly, () => {
  const repo = temp("onrails-writers-repo-");
  const mine = folder(0o755);
  const open = folder(0o777);
  const sticky = folder(0o1777);
  const group = folder(0o775);
  const swappable = folder(0o755, folder(0o777));
  const env = { PATH: [mine, open, sticky, swappable].join(":") };
  assert.deepEqual(pathOutside(repo, "linux", env), { PATH: native(mine) });
  // The group bit counts only when the group is this user's alone, with no ACL: the registry's rule (row 69).
  const alone = { uid: statSync(group).uid, gid: statSync(group).gid, acl: () => false, privateGroup: () => true };
  assert.equal(othersCanWrite(native(group), { sys: alone }), null);
  assert.match(othersCanWrite(native(group), { sys: { ...alone, privateGroup: () => false } }), /group can write/);
  assert.match(othersCanWrite(native(group), { sys: { ...alone, acl: () => null } }), /ACL/);
  const theirs = folder(0o755);
  const { sys } = othersOwn(theirs);
  assert.match(othersCanWrite(native(theirs), { sys }), /belongs to another user/);
});

test("AC-232-3: WHEN the only git, npm and gh on PATH are in a folder another user can write THEN preflight runs none of them before the read", posixOnly, () => {
  const mark = temp("onrails-writers-mark-");
  const bin = folder(0o755);
  fakes(bin, ["git", "npm", "gh"], mark);
  const repo = temp("onrails-writers-repo-");
  const path = `${bin}:${pathWith("node")}`;
  runScript(repo, path, "--json");
  assert.deepEqual(ran(mark), ["gh", "git", "npm"], "the control: a folder only this user can write is used");
  const fresh = temp("onrails-writers-mark-");
  const open = folder(0o777);
  fakes(open, ["git", "npm", "gh"], fresh);
  runScript(repo, `${open}:${pathWith("node")}`, "--json");
  assert.deepEqual(ran(fresh), [], "preflight ran a tool from a folder another user can write");
});

test("AC-232-3: WHEN preflight leaves a PATH folder off, or --mark-read refuses a repo, THEN it says which folder and why", posixOnly, () => {
  const repo = folder(0o755);
  mkdirSync(join(repo, ".git"));
  const open = folder(0o777);
  const table = runScript(repo, `${open}:${pathWith("node")}`).stdout;
  assert.match(table, new RegExp(`Left off PATH before the read[^\\n]*: others can write ${native(open)}`), "the table didn't say why git wasn't found");
  chmodSync(repo, 0o777);
  const refused = runScript(repo, pathWith("node"), "--mark-read").stdout;
  assert.match(refused, new RegExp(`not marked: others can write ${native(repo)}`), "the refusal didn't name the folder");
});

test("AC-232-1: WHEN the temp base is reached through a symlink in a folder others can write THEN only the checked real path is used", posixOnly, () => {
  const open = folder(0o777);
  const target = folder(0o700);
  const link = join(open, "link");
  symlinkSync(target, link);
  const temps = tempFolders(temp("onrails-writers-repo-"), "linux", undefined, [link]);
  try {
    for (const used of [temps.hooks, temps.away.cwd]) {
      assert.equal(dirname(used), native(target), `${used} goes through a folder another user can write`);
      assert.equal(used, native(used), `${used} isn't a real path`);
    }
    assert.equal(temps.away.env.GIT_CEILING_DIRECTORIES, native(target));
  } finally {
    temps.remove();
  }
  assert.deepEqual(readdirSync(target), [], "the temp folder wasn't removed");
});

test("AC-232-1: WHEN npm runs from its outside temp folder THEN the person's global npmrc still names the registry", posixOnly, () => {
  const above = temp("onrails-writers-above-");
  writeFileSync(join(above, "package.json"), "{}");
  writeFileSync(join(above, ".npmrc"), "registry=http://127.0.0.2:9/\n");
  // npm finds its global npmrc at <its prefix>/etc/npmrc, and PREFIX names that prefix. HOME holds no user .npmrc.
  const prefix = temp("onrails-writers-prefix-");
  mkdirSync(join(prefix, "etc"));
  writeFileSync(join(prefix, "etc", "npmrc"), "registry=http://127.0.0.4:9/\n");
  const repo = temp("onrails-writers-repo-");
  const report = runScript(repo, { TMPDIR: above, PREFIX: prefix, PATH: pathWith("node", "npm") }, "--json");
  const detail = report.results.find((r) => r.id === "registry").detail;
  assert.match(detail, /^127\.0\.0\.4:9 didn't answer/, "npm skipped the global npmrc");
  assert.equal(report.away, true);
});
