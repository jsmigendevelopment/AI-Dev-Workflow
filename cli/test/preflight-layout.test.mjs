// #182 round 3: before the read, the repo's layout is read the way the system and git read it, and when any part of it
// can't be read, no PATH folder is kept. A checkout git still uses counts even when no record names it where it is.
// Real git worktrees, the real script, fakes that leave a file behind when they run.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { mkdirSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative } from "node:path";
import { pathOutside, tempFolders } from "../src/preflight-layout.mjs";
import { probe } from "../src/preflight.mjs";
import { fakes, fakeSys, gitRepo, HEALTHY, pathWith, ran, runScript, sh, status, temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "the fakes are POSIX shell scripts and symlinks" : false };
const native = (path) => realpathSync.native(path);
const inside = (path, top) => !relative(native(top), native(path)).startsWith("..");
const TOOLS = ["git", "registry", "github", "versions"];
const AFTER = /checked after the repo is read/;

/** A repo whose committed bin2 holds fake git, npm and gh, and linked worktrees of it outside it. Nothing is marked read. */
function checkouts(mark, names = ["wt"]) {
  const main = gitRepo("", { "package.json": JSON.stringify({ packageManager: "pnpm@10.28.0" }) });
  fakes(join(main, "bin2"), ["git", "npm", "gh", "pnpm"], mark);
  sh(main, "add", "bin2");
  sh(main, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "bin2");
  const parent = temp("onrails-layout-tree-");
  const trees = names.map((name) => join(parent, name));
  for (const tree of trees) sh(main, "worktree", "add", "--quiet", "--detach", tree);
  return { main, trees, parent };
}

/** Runs fn with one fs function replaced, as preflight sees it through its named imports. */
function stubbed(name, fake, fn) {
  const real = fs[name];
  fs[name] = (...args) => fake(real, ...args);
  syncBuiltinESMExports();
  try {
    return fn();
  } finally {
    fs[name] = real;
    syncBuiltinESMExports();
  }
}
const denied = () => Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });

test("AC-182-2: WHEN a worktree record in the common .git folder can't be read THEN the PATH before the read keeps no entry at all", posixOnly, () => {
  const { main, trees: [tree] } = checkouts(temp("onrails-layout-mark-"));
  const out = temp("onrails-layout-out-");
  const env = { PATH: `${join(tree, "bin2")}:${out}` };
  assert.deepEqual(pathOutside(main, "linux", env), { PATH: native(out) }, "the control: a readable layout keeps the folder outside");
  const record = /[\\/]worktrees[\\/][^\\/]+[\\/]gitdir$/;
  stubbed("readFileSync", (real, path, ...rest) => { if (record.test(String(path))) throw denied(); return real(path, ...rest); }, () => {
    for (const dir of [main, tree]) assert.deepEqual(pathOutside(dir, "linux", env), { PATH: "" }, dir);
  });
});

test("AC-182-2: WHEN the repo's layout can't be read THEN every row that needs a command says it's checked after the read, and none runs", posixOnly, async () => {
  const mark = temp("onrails-layout-mark-");
  const { main } = checkouts(mark);
  // A commondir with a trailing space: git keeps the space, text folding would drop it, so preflight reads nothing more.
  writeFileSync(join(main, ".git", "commondir"), "c \n");
  symlinkSync(".", join(main, ".git", "c "));
  const out = join(temp("onrails-layout-out-"), "bin");
  fakes(out, ["gh"], mark);
  const report = await probe(main, fakeSys({ env: { PATH: out }, answers: HEALTHY }));
  for (const id of TOOLS) {
    assert.equal(status(report, id), "limited", id);
    assert.match(report.results.find((r) => r.id === id).detail, AFTER, id);
  }
  const real = runScript(main, `${join(main, "bin2")}:${out}:${pathWith("git", "npm")}`, "--json");
  assert.deepEqual(ran(mark), [], "a command ran from a PATH entry kept while the layout was unknown");
  for (const id of TOOLS) assert.equal(status(real, id), "limited", id);
});

for (const [name, odd] of [
  ["a symlink before a ..", (git) => { mkdirSync(join(git, "c")); mkdirSync(join(git, "a")); symlinkSync("../c", join(git, "a", "lnk")); return "a/lnk/.."; }],
  // A folder named without the space is there too, so dropping the space reads another folder, not a missing one.
  ["a trailing space", (git) => { mkdirSync(join(git, "c")); symlinkSync(".", join(git, "c ")); return "c "; }],
]) {
  test(`AC-182-2: WHEN the main .git folder's commondir names it through ${name} THEN a PATH folder in a linked worktree still runs nothing before the read`, posixOnly, () => {
    const mark = temp("onrails-layout-mark-");
    const { main, trees: [tree] } = checkouts(mark);
    writeFileSync(join(main, ".git", "commondir"), `${odd(join(main, ".git"))}\n`);
    assert.match(sh(main, "worktree", "list").stdout, new RegExp(`^${native(tree)} `, "m"), "the control: git still lists the worktree");
    const report = runScript(main, `${join(tree, "bin2")}:${pathWith("git", "npm")}`, "--json");
    assert.equal(report.read, false);
    assert.deepEqual(ran(mark), [], "a program the worktree ships ran");
  });
}

test("AC-182-2: WHEN a linked worktree was moved with mv THEN a PATH folder in it runs nothing before the read, from the main checkout or another worktree", posixOnly, () => {
  const mark = temp("onrails-layout-mark-");
  const { main, trees: [tree, other], parent } = checkouts(mark, ["wt", "wt2"]);
  const moved = join(parent, "moved");
  renameSync(tree, moved);
  assert.equal(sh(moved, "rev-parse", "--show-toplevel").stdout.trim(), native(moved), "the control: git still uses the moved worktree");
  for (const from of [main, other]) {
    const report = runScript(from, `${join(moved, "bin2")}:${pathWith("git", "npm")}`, "--json");
    assert.equal(report.read, false);
    assert.deepEqual(ran(mark), [], `from ${from === main ? "the main checkout" : "another worktree"}: a program the moved worktree ships ran`);
    assert.equal(status(report, "git"), "ok", "the real git did the probe");
  }
});

test("AC-182-2: WHEN a worktree record names a folder whose .git doesn't name that record back THEN that folder isn't counted as the repo", posixOnly, () => {
  const { main, trees: [tree] } = checkouts(temp("onrails-layout-mark-"));
  // Two folders outside the repo with tools in them: one with no .git, and another repository, whose .git is its own.
  const plain = temp("onrails-layout-plain-");
  const other = gitRepo("");
  for (const dir of [plain, other]) mkdirSync(join(dir, "bin"));
  for (const [id, dir] of [["x1", plain], ["x2", other]]) {
    mkdirSync(join(main, ".git", "worktrees", id));
    writeFileSync(join(main, ".git", "worktrees", id, "gitdir"), `${join(dir, ".git")}\n`);
  }
  const env = { PATH: [join(plain, "bin"), join(other, "bin"), join(tree, "bin2")].join(":") };
  assert.deepEqual(pathOutside(main, "linux", env), { PATH: `${native(join(plain, "bin"))}:${native(join(other, "bin"))}` });
});

// The /tmp and home-folder fallback is one loop with one check. The platform is given as Windows so /tmp is passed over:
// the test then makes no folder outside this run's own temp folder, and stubs nothing that makes one.
test("AC-182-2: WHEN TMPDIR and the home folder are both inside another checkout THEN the probes get no temp folder in it; a home folder outside is used", posixOnly, () => {
  const { main, trees: [tree] } = checkouts(temp("onrails-layout-mark-"));
  const spot = join(main, "spot");
  mkdirSync(spot);
  const saved = { TMPDIR: process.env.TMPDIR, HOME: process.env.HOME };
  const home = temp("onrails-layout-home-");
  try {
    process.env.TMPDIR = spot;
    process.env.HOME = spot;
    const none = tempFolders(tree, "win32");
    none.remove();
    assert.equal(none.away, null, `the probes would run from ${none.away?.cwd}, inside the main checkout`);
    process.env.HOME = home;
    const away = tempFolders(tree, "win32");
    away.remove();
    assert.equal(dirname(away.away.cwd), native(home), "the home folder outside the repo wasn't used");
    assert.equal(inside(dirname(away.away.cwd), main), false);
  } finally {
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  assert.deepEqual(fs.readdirSync(spot), [], "a temp folder made inside the checkout was left behind");
});
