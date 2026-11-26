// #232, review round 2: tempFolders checks a temp base before it makes anything there, then uses the folder it made as
// made, never resolved again, and removes only that. Here the first look at a folder preflight made (its realpath or
// its lstat) swaps it for a symlink to another folder of this user's, as another user could in a base they can write.
// That folder must be neither handed out (as git's hooks folder or npm's working folder) nor removed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { chmodSync, mkdirSync, readdirSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, join } from "node:path";
import { tempFolders } from "../src/preflight-layout.mjs";
import { notOwnFolder, othersCanSwapIn } from "../src/preflight-sys.mjs";
import { temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "POSIX modes" : false };
const native = (path) => realpathSync.native(path);

/** A new folder with the given mode in a fresh temp folder. */
function folder(mode) {
  const dir = join(temp("onrails-swap-"), `m${mode.toString(8)}`);
  mkdirSync(dir);
  chmodSync(dir, mode);
  return dir;
}

/** Another folder of this user's, with a file in it: what a swap would point the new folder at. */
function victim() {
  const dir = folder(0o700);
  writeFileSync(join(dir, "keep"), "this user's own file\n");
  return dir;
}

/**
 * Runs body while the first realpath or lstat of a folder preflight made in one of bases swaps that folder for a
 * symlink to target. Returns the folders it swapped.
 */
function withSwap(bases, target, body) {
  const inside = bases.map(native);
  const swapped = [];
  const swap = (path) => {
    const at = String(path);
    if (!inside.includes(dirname(at)) || !basename(at).startsWith("onrails-preflight-") || swapped.includes(at)) return;
    if (!lstat(at).isDirectory()) return;
    rmdirSync(at);
    symlinkSync(target, at);
    swapped.push(at);
  };
  const realpath = fs.realpathSync.native;
  const lstat = fs.lstatSync;
  fs.realpathSync.native = (path, ...rest) => { swap(path); return realpath(path, ...rest); };
  fs.lstatSync = (path, ...rest) => { swap(path); return lstat(path, ...rest); };
  syncBuiltinESMExports();
  try {
    body();
  } finally {
    fs.realpathSync.native = realpath;
    fs.lstatSync = lstat;
    syncBuiltinESMExports();
  }
  return swapped;
}

/** Asserts no folder tempFolders handed out is target, then that remove() left target and its file in place. */
function neverTarget(temps, target) {
  try {
    for (const used of [temps.hooks, temps.away?.cwd].filter(Boolean)) {
      assert.notEqual(native(used), native(target), `${used} is the swapped-in folder`);
      assert.equal(used, native(used), `${used} isn't the folder as made`);
    }
  } finally {
    temps.remove();
  }
  assert.deepEqual(readdirSync(target), ["keep"], "the swapped-in folder was emptied or removed");
}

test("AC-232-1: WHEN a base others can write without the sticky bit would let them swap the new folder THEN preflight makes nothing there, and never uses or removes the folder swapped in", posixOnly, () => {
  const open = folder(0o777);
  const home = folder(0o700);
  const target = victim();
  let temps;
  const swapped = withSwap([open], target, () => {
    temps = tempFolders(temp("onrails-swap-repo-"), "linux", undefined, [open, home]);
  });
  assert.deepEqual(swapped, [], "a folder was made in a base others can swap it in");
  assert.equal(dirname(temps.hooks), native(home), "the hooks folder isn't the home folder's");
  assert.equal(dirname(temps.away.cwd), native(home), "npm's folder isn't the home folder's");
  neverTarget(temps, target);
  assert.deepEqual(readdirSync(open), [], "something was left in the base others can write");
});

test("AC-232-1: WHEN the folder made in a safe base is no longer a plain folder of this user's THEN it isn't used, and only that entry is removed", posixOnly, () => {
  const safe = folder(0o700);
  const home = folder(0o700);
  const target = victim();
  let temps;
  const swapped = withSwap([safe], target, () => {
    temps = tempFolders(temp("onrails-swap-repo-"), "linux", undefined, [safe, home]);
  });
  assert.equal(swapped.length, 1, "the control: the folder made in the safe base was swapped");
  assert.equal(dirname(temps.hooks), native(home), "the swapped folder was handed out as the hooks folder");
  assert.equal(dirname(temps.away.cwd), native(home), "the swapped folder was handed out as npm's folder");
  neverTarget(temps, target);
  assert.deepEqual(readdirSync(safe), [], "the symlink left in the safe base wasn't removed");
});

test("AC-232-1: WHEN a temp base is checked THEN a symlink on its path, or a folder above it others can swap, is unsafe, and a plain sticky one is safe", posixOnly, () => {
  const sticky = folder(0o1777);
  assert.equal(othersCanSwapIn(native(sticky)), null, "the control: a sticky folder no one else can swap is safe");
  const link = join(temp("onrails-swap-"), "link");
  symlinkSync(native(sticky), link);
  assert.match(othersCanSwapIn(link), /is a symlink/);
  const inOpen = join(native(folder(0o777)), "base");
  mkdirSync(inOpen, { mode: 0o700 });
  assert.match(othersCanSwapIn(inOpen), /no sticky bit to stop a swap of/);
  assert.match(othersCanSwapIn("relative"), /isn't a full path/);
  // The folder made: a plain folder of this user's that only this user can write.
  const made = folder(0o700);
  assert.equal(notOwnFolder(made), null, "the control: a plain 0700 folder of this user's");
  const pointer = join(temp("onrails-swap-"), "made");
  symlinkSync(made, pointer);
  assert.match(notOwnFolder(pointer), /isn't a plain folder/);
  chmodSync(made, 0o777);
  assert.match(notOwnFolder(made), /others can write/);
});
