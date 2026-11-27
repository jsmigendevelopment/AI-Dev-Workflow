// #182 round 2: before the read, every checkout of the repository counts as the repo: the main checkout and each
// linked worktree, found without running git. Real git worktrees, the real script, fakes that leave a file behind when they run.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { mkdirSync, realpathSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, relative } from "node:path";
import { pathOutside, tempFolders } from "../src/preflight-layout.mjs";
import { markRead } from "../src/preflight-sys.mjs";
import { fakes, gitRepo, pathWith, ran, runScript, sh, status, temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "the fakes are POSIX shell scripts" : false };
const native = (path) => realpathSync.native(path);
const inside = (path, top) => !relative(native(top), native(path)).startsWith("..");

/** A repo whose committed bin2 holds fake git, npm and gh, and a linked worktree of it outside it. Nothing is marked read. */
function repoWithTree(mark) {
  const main = gitRepo("");
  fakes(join(main, "bin2"), ["git", "npm", "gh"], mark);
  sh(main, "add", "bin2");
  sh(main, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "bin2");
  const tree = join(temp("onrails-checkouts-tree-"), "wt");
  sh(main, "worktree", "add", "--quiet", "--detach", tree);
  return { main, tree };
}

for (const [from, other] of [["tree", "main"], ["main", "tree"]]) {
  test(`AC-182-2: WHEN preflight runs in the ${from === "tree" ? "linked worktree" : "main checkout"} and PATH names a folder in the ${other === "tree" ? "linked worktree" : "main checkout"} THEN it runs no command from it until the read`, posixOnly, () => {
    const mark = temp("onrails-checkouts-mark-");
    const checkouts = repoWithTree(mark);
    const real = pathWith("git");
    const path = `${join(checkouts[other], "bin2")}:${real}`;
    const report = runScript(checkouts[from], path, "--json");
    assert.equal(report.read, false);
    assert.deepEqual(ran(mark), [], `a program the other checkout ships ran`);
    assert.equal(status(report, "git"), "ok", "the real git, found after that folder, did the probe");
    // The control: once this checkout is read, the same PATH runs the other checkout's git.
    assert.equal(markRead(checkouts[from]), native(checkouts[from]));
    runScript(checkouts[from], path, "--json");
    assert.ok(ran(mark).includes("git"), "the fake git never ran, so the test proves nothing");
  });
}

test("AC-182-2: WHEN the repo has more than one linked worktree THEN the PATH before the read keeps no folder of any checkout", posixOnly, () => {
  const mark = temp("onrails-checkouts-mark-");
  const { main, tree } = repoWithTree(mark);
  const second = join(temp("onrails-checkouts-tree-"), "wt2");
  sh(main, "worktree", "add", "--quiet", "--detach", second);
  const out = temp("onrails-checkouts-out-");
  const env = { PATH: [main, tree, second].map((dir) => join(dir, "bin2")).concat(out).join(":") };
  for (const dir of [main, tree, second]) assert.deepEqual(pathOutside(dir, "linux", env), { PATH: native(out) }, dir);
});

test("AC-182-2: WHEN the common .git folder's worktree list can't be read THEN the PATH before the read keeps no entry at all", posixOnly, () => {
  const mark = temp("onrails-checkouts-mark-");
  const { main, tree } = repoWithTree(mark);
  const out = temp("onrails-checkouts-out-");
  const real = fs.readdirSync;
  fs.readdirSync = () => { throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }); };
  syncBuiltinESMExports();
  try {
    // Fails closed: even the folder outside every checkout is left out, as no checkout can be ruled out.
    assert.deepEqual(pathOutside(tree, "linux", { PATH: `${join(main, "bin2")}:${out}` }), { PATH: "" });
  } finally {
    fs.readdirSync = real;
    syncBuiltinESMExports();
  }
});

test("AC-182-2: WHEN TMPDIR is inside the main checkout and preflight runs in a linked worktree THEN its probes run from a folder outside both", posixOnly, () => {
  const mark = temp("onrails-checkouts-mark-");
  const { main, tree } = repoWithTree(mark);
  const was = process.env.TMPDIR;
  process.env.TMPDIR = join(main, "tmp");
  mkdirSync(join(main, "tmp"));
  let temps;
  try {
    temps = tempFolders(tree, "linux");
  } finally {
    if (was === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = was;
  }
  try {
    assert.ok(temps.away, "no folder outside both checkouts was found");
    assert.equal(inside(temps.away.cwd, main), false, "the probes run from inside the main checkout");
    assert.equal(inside(temps.away.cwd, tree), false);
  } finally {
    temps.remove();
  }
});
