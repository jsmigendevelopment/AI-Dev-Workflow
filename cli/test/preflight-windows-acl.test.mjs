// #246: on Windows, preflight's "only this user can write it" checks from #232 read each folder's ACL, all of them in one
// PowerShell start. Real folders on this machine, checked as "win32" against a fake PowerShell that answers the way the
// batch does (as row 106's tests fake the registry's reader; the root
// folder answers as C:\ does). Nothing here needs Windows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathOutside, tempFolders } from "../src/preflight-layout.mjs";
import { aclPaths, loadWinAcls, othersCanWrite } from "../src/preflight-owner.mjs";
import { main } from "../src/preflight.mjs";
import { repoTop } from "../src/preflight-sys.mjs";
import { fakePowerShell, fakeSys, HEALTHY, temp, WIN_ME, WIN_OWN, WIN_TI } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "POSIX paths stand in for Windows ones" : false };
const win = { platform: "win32" };
const native = (path) => realpathSync.native(path);

const ME = WIN_ME;
const OWN = WIN_OWN;
// Authenticated Users may modify it.
const OPEN = [`owner ${ME}`, `Allow ${ME} 2032127`, "Allow S-1-5-11 1245631"];
// Users may make folders in it, and nothing more.
const MAKE = [`owner ${ME}`, `Allow ${ME} 2032127`, "Allow S-1-5-32-545 4"];
// System32: TrustedInstaller's, which SYSTEM and Administrators may modify, and CREATOR OWNER below it.
const SYSTEM32 = [`owner ${WIN_TI}`, `Allow ${WIN_TI} 2032127`, "Allow S-1-5-18 1245631", "Allow S-1-5-32-544 1245631", "Allow S-1-3-0 268435456",
  "Allow S-1-5-32-545 -1610612736"];

test("AC-246-1: WHEN a PATH folder outside the repo has an ACL that lets another account write it THEN preflight leaves it off PATH before the read", posixOnly, () => {
  const repo = temp("onrails-winacl-repo-");
  const [own, shared, system, maker] = ["own", "shared", "system", "maker"].map((name) => native(temp(`onrails-winacl-${name}-`)));
  const env = { PATH: [own, shared, system, maker].join(";") };
  loadWinAcls(aclPaths(repo, env, []), fakePowerShell({ [shared]: OPEN, [system]: SYSTEM32, [maker]: MAKE }));
  const dropped = [];
  const kept = pathOutside(repo, "win32", env, undefined, dropped);
  assert.deepEqual(kept.PATH.split(";"), [own, system], "only the folders no other account can write stay, System32's owner included");
  assert.deepEqual(dropped, [`another account can write ${shared}`, `another account can write ${maker}`]);
});

test("AC-246-1: WHEN a folder above a PATH folder lets another account rename what is in it THEN that folder is left off too", posixOnly, () => {
  const repo = temp("onrails-winacl-repo-");
  const parent = native(temp("onrails-winacl-parent-"));
  const tools = join(parent, "bin");
  mkdirSync(tools);
  const env = { PATH: tools };
  // Delete child (0x40): another account could swap bin for a folder of its own.
  loadWinAcls(aclPaths(repo, env, []), fakePowerShell({ [parent]: [`owner ${ME}`, `Allow ${ME} 2032127`, "Allow S-1-5-11 64"] }));
  const dropped = [];
  assert.equal(pathOutside(repo, "win32", env, undefined, dropped).PATH, "");
  assert.deepEqual(dropped, [`another account can rename or replace ${tools} in ${parent}`]);
});

test("AC-246-2: WHEN repoTop() walks up on Windows THEN it stops at a folder whose ACL lets another account write it", posixOnly, () => {
  const top = native(temp("onrails-winacl-top-"));
  mkdirSync(join(top, ".git"));
  const start = join(top, "app");
  mkdirSync(start);
  loadWinAcls(aclPaths(start, {}, []), fakePowerShell());
  assert.equal(repoTop(start, win), top, "the control: a folder only this user (and C:\\'s make-folders right) can touch is trusted");
  for (const acl of [OPEN, MAKE, [`owner S-1-5-21-1-2-3-1002`, "Allow S-1-5-18 2032127"]]) {
    loadWinAcls(aclPaths(start, {}, []), fakePowerShell({ [top]: acl }));
    assert.equal(repoTop(start, win), null, `${acl.join(" | ")}: the walk trusted a .git another account could have put there`);
  }
});

test("AC-246-3: WHEN preflight picks its temp folder on Windows THEN it uses one only this user or the trusted accounts can write, from one PowerShell start", posixOnly, () => {
  const repo = temp("onrails-winacl-repo-");
  mkdirSync(join(repo, ".git"));
  const [open, maker, theirs, own] = ["open", "maker", "theirs", "own"].map((name) => native(temp(`onrails-winacl-base-${name}-`)));
  const tools = native(temp("onrails-winacl-tools-"));
  const env = { PATH: tools };
  const trusted = [...OWN, `Allow ${WIN_TI} 2032127`, "Allow S-1-3-0 268435456"];
  const fake = fakePowerShell({ [open]: OPEN, [maker]: MAKE, [theirs]: [`owner S-1-5-21-1-2-3-1002`, "Allow S-1-5-18 2032127"], [own]: trusted });
  const bases = [open, maker, theirs, own];
  // The whole run's checks, as main() and probe() make them: the repo's top and git folder, PATH and the temp folders.
  loadWinAcls(aclPaths(repo, env, bases), fake);
  assert.equal(repoTop(repo, win), native(repo));
  assert.equal(othersCanWrite(join(repo, ".git"), win), null);
  assert.equal(pathOutside(repo, "win32", env).PATH, tools);
  const temps = tempFolders(repo, "win32", undefined, bases);
  try {
    assert.equal(dirname(temps.away.cwd), own, `npm would run from ${temps.away.cwd}`);
    assert.equal(dirname(temps.hooks), own, `git's hooks folder is in ${temps.hooks}`);
  } finally {
    temps.remove();
  }
  for (const base of [open, maker, theirs]) assert.deepEqual(readdirSync(base), [], `a folder was made in ${base}`);
  assert.equal(fake.starts, 1, "every ACL came from one PowerShell start");
});

test("AC-246-3: WHEN PowerShell can't read a folder's ACL, or answers nothing THEN that folder counts as unsafe", posixOnly, () => {
  const tools = native(temp("onrails-winacl-tools-"));
  const env = { PATH: tools };
  const repo = temp("onrails-winacl-repo-");
  loadWinAcls(aclPaths(repo, env, []), fakePowerShell({ [tools]: ["error"] }));
  assert.equal(pathOutside(repo, "win32", env).PATH, "");
  loadWinAcls(aclPaths(repo, env, []), () => null);
  assert.match(othersCanWrite(tools, win), /can't be checked \(its ACL wasn't read\)/);
});

test("AC-246-1: WHEN a folder above has a rule only for what is made inside it, as C:\\ does THEN a folder below still passes, and the same rule on the folder itself fails", posixOnly, () => {
  const repo = temp("onrails-winacl-repo-");
  const parent = native(temp("onrails-winacl-parent-"));
  const tools = join(parent, "bin");
  mkdirSync(tools);
  const env = { PATH: tools };
  const inheritOnly = [`owner ${ME}`, `Allow ${ME} 2032127`, "Allow S-1-5-11 1245631 io"];
  loadWinAcls(aclPaths(repo, env, []), fakePowerShell({ [parent]: inheritOnly }));
  assert.equal(othersCanWrite(tools, win), null, "Modify for what is made in the folder above swaps nothing in it");
  assert.equal(pathOutside(repo, "win32", env).PATH, tools);
  loadWinAcls(aclPaths(repo, env, []), fakePowerShell({ [tools]: inheritOnly }));
  assert.equal(othersCanWrite(tools, win), `another account can write ${tools}`, "on the folder itself, what is made there gets the rule");
  loadWinAcls(aclPaths(repo, env, []), fakePowerShell({ [parent]: inheritOnly.map((l) => l.replace(/ io$/, "")) }));
  assert.equal(othersCanWrite(tools, win), `another account can rename or replace ${tools} in ${parent}`, "the control: the same rule on the folder above");
});

test("AC-246-3: WHEN preflight runs on Windows THEN main() reads every ACL in one PowerShell start, and leaves a shared PATH folder off", posixOnly, async () => {
  const repo = temp("onrails-winacl-repo-");
  mkdirSync(join(repo, ".git"));
  const [own, shared] = ["own", "shared"].map((name) => native(temp(`onrails-winacl-${name}-`)));
  const fake = fakePowerShell({ [shared]: OPEN });
  const sys = { ...fakeSys({ answers: HEALTHY, env: { PATH: [own, shared].join(";") } }), platform: "win32", winAcls: fake };
  let out = "";
  await main([repo, "--json"], { sys, log: (text) => (out += text) });
  const report = JSON.parse(out);
  assert.equal(fake.starts, 1, "one PowerShell start for the whole run");
  assert.deepEqual(report.unsafe, [`another account can write ${shared}`]);
  const gh = sys.runs.find((r) => r.line.startsWith("gh "));
  assert.equal(gh?.env?.PATH, own, "gh is found only in the folder no other account can write");
});
