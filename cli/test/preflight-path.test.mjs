// #182: before the repo is read, preflight is started only by a route the repo can't change, finds no command in a
// PATH folder inside the repo, and a folder left where a deleted worktree was doesn't count as read.
// The real script runs in throwaway repos, from the repo as the current folder, with fakes that leave a file behind when they run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import fs, { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync,
  unlinkSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRead, markRead, realSys } from "../src/preflight-sys.mjs";
import { put, safeEnv } from "./helpers.mjs";
import { fakes, gitRepo, pathWith, PLAYWRIGHT, project, ran, runScript, sh, status, temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "the fakes are POSIX shell scripts and symlinks" : false };
const native = (path) => realpathSync.native(path);
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");

test("AC-182-1: WHEN the docs and skills that run preflight before the read are read THEN none names the npx route for that step", () => {
  const docs = [".agents/skills/ask/references/preflight.md", ".agents/skills/join/SKILL.md", ".agents/skills/back/SKILL.md",
    ".agents/skills/idea/SKILL.md", ".agents/skills/build/SKILL.md", "cli/CLI.md", "README.md"];
  for (const doc of docs) assert.doesNotMatch(read(doc), /npx onrails preflight/, doc);
  for (const doc of docs.slice(0, 5)) assert.match(read(doc), /^(.*`)?node \.agents\/skills\/ask\/scripts\/preflight\.mjs/m, doc);
  // The reference and the CLI page say why, and name the safe routes.
  for (const doc of [".agents/skills/ask/references/preflight.md", "cli/CLI.md"]) {
    assert.match(read(doc), /never through `npx`/, doc);
    assert.match(read(doc), /`PATH`/, doc);
    assert.match(read(doc), /by its absolute path/, doc);
  }
});

test("AC-182-2: WHEN a PATH entry's real path is inside the repo and the repo isn't read THEN preflight runs no command from it", posixOnly, () => {
  const mark = temp("onrails-path-mark-");
  const dir = gitRepo("", PLAYWRIGHT);
  // A folder inside the repo first on PATH, and a folder outside the repo that is a symlink to it.
  const bin = join(dir, "node_modules", ".bin");
  fakes(bin, ["git", "gh", "npm", "pnpm"], mark);
  const link = join(temp("onrails-path-link-"), "bin");
  symlinkSync(bin, link);
  const real = pathWith("git");
  for (const path of [`${bin}:${real}`, `${link}:${real}`]) {
    const report = runScript(dir, path, "--json");
    assert.equal(report.read, false);
    assert.deepEqual(ran(mark), [], `PATH ${path.replace(dir, "<repo>")}: a program the repo ships ran`);
    assert.equal(status(report, "git"), "ok", "the real git, found after the repo's folder, did the probe");
  }
  // A command started from outside the repo gets that PATH too, so nothing it starts comes from the repo's folder.
  const outside = join(temp("onrails-path-out-"), "bin");
  fakes(outside, ["gh"], mark);
  runScript(dir, `${bin}:.:node_modules/.bin:${outside}:${real}`, "--json");
  assert.deepEqual(ran(mark), ["gh"]);
  assert.equal(readFileSync(join(mark, "gh"), "utf8").trim(), `${outside}:${real}`);
  rmSync(join(mark, "gh"));
  // The lookup alone, as the version row uses it: given the probes' PATH, the repo's pnpm isn't found.
  const sys = realSys({ env: { PATH: `${bin}:${outside}` } });
  assert.equal(sys.has("pnpm"), true);
  assert.equal(sys.has("pnpm", { PATH: outside }), false);
  // The control: once the repo is marked read, the same PATH finds and runs the repo's own git.
  assert.ok(markRead(dir));
  runScript(dir, `${bin}:${real}`, "--json");
  assert.ok(ran(mark).includes("git"), "the fake git never ran, so the test proves nothing");
});

test("AC-182-2: WHEN a PATH entry names a folder outside the repo by a route the OS reads as inside it THEN preflight drops it and passes on only resolved paths", posixOnly, () => {
  const mark = temp("onrails-path-mark-");
  const dir = gitRepo("", PLAYWRIGHT);
  fakes(join(dir, "bin2"), ["git", "npm", "node"], mark);
  // Outside the repo: a symlink into the repo, an empty folder named like the repo's, and a fake gh.
  const out = join(temp("onrails-path-out-"), "out");
  mkdirSync(join(out, "bin2"), { recursive: true });
  mkdirSync(join(out, "x"));
  symlinkSync(join(dir, "node_modules"), join(out, "lnk"));
  fakes(join(out, "tools"), ["gh"], mark);
  const real = pathWith("git", "npm");
  const entry = `${out}/lnk/../bin2`;
  const report = runScript(dir, `${entry}:${out}/x/../tools:${real}`, "--json");
  assert.equal(report.read, false);
  assert.deepEqual(ran(mark), ["gh"], "a program the repo ships ran");
  assert.equal(readFileSync(join(mark, "gh"), "utf8").trim(), `${native(join(out, "tools"))}:${native(real)}`, "a command got a raw PATH entry");
  assert.equal(status(report, "git"), "ok", "the real git did the probe");
  rmSync(join(mark, "gh"));
  // The control: once the repo is read, PATH isn't cut, and npm's own `env node` finds the repo's node through that entry.
  assert.ok(markRead(dir));
  runScript(dir, `${entry}:${real}`, "--json");
  assert.ok(ran(mark).includes("node"), "the repo's node never ran, so the entry doesn't reach the repo and the test proves nothing");
});

// The tools to make a bind mount in a namespace of its own, which ends with the process. Linux only.
const tool = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8", env: safeEnv() }).stdout.trim();
function canMount() {
  if (process.platform !== "linux" || !tool("unshare") || !tool("mount")) return false;
  const at = temp("onrails-path-probe-");
  return spawnSync(tool("unshare"), ["-rm", tool("mount"), "--bind", at, at], { env: safeEnv() }).status === 0;
}
const mounts = canMount();

test("AC-182-2: WHEN a PATH folder is the repo mounted at another path THEN preflight runs no command from it", { skip: mounts ? false : "needs unshare and a bind mount (Linux)" }, () => {
  const mark = temp("onrails-path-mark-");
  const dir = gitRepo("", PLAYWRIGHT);
  fakes(join(dir, "bin"), ["git", "gh", "npm"], mark);
  const mnt = temp("onrails-path-mnt-");
  const real = pathWith("git");
  const script = fileURLToPath(new URL("../src/preflight.mjs", import.meta.url));
  // Mounts the repo at mnt, then runs the real script from the repo with only these two PATH entries.
  const run = () => spawnSync(tool("unshare"), ["-rm", tool("sh"), "-c", '"$1" --bind "$2" "$3" && cd "$2" && PATH="$4" exec "$5" "$6" "$2" --json',
    "sh", tool("mount"), dir, mnt, `${mnt}/bin:${real}`, process.execPath, script], { encoding: "utf8", env: { HOME: temp("onrails-read-home-") } });
  const report = JSON.parse(run().stdout);
  assert.equal(report.read, false);
  assert.deepEqual(ran(mark), [], "a program the repo ships ran from the mount");
  assert.equal(status(report, "git"), "ok", "the real git did the probe");
  // The control: once the repo is read, the same PATH runs the repo's git through the mount.
  assert.ok(markRead(dir));
  run();
  assert.ok(ran(mark).includes("git"), "the fake git never ran, so the mount doesn't reach the repo and the test proves nothing");
});

/** A repo marked read, and a linked worktree of it at <a temp folder>/wt, marked read itself. */
function markedTree() {
  const main = gitRepo("", PLAYWRIGHT);
  assert.ok(markRead(main));
  const tree = join(temp("onrails-path-tree-"), "wt");
  sh(main, "worktree", "add", "--quiet", "--detach", tree);
  return { main, tree, admin: join(main, ".git", "worktrees", "wt") };
}

test("AC-182-3: WHEN a folder sits where a deleted but not pruned worktree used to be THEN it doesn't count as read", posixOnly, () => {
  const { tree, admin } = markedTree();
  assert.equal(markRead(tree), tree);
  assert.equal(isRead(tree), true, "the control: the worktree itself was marked");
  // An archive unpacked next to it, then moved to the exact path once the worktree folder is deleted (no prune).
  // Unpacked first, so its folder can't reuse the deleted folder's inode number.
  const archive = project({ ...PLAYWRIGHT, ".git": `gitdir: ${admin}\n` });
  rmSync(tree, { recursive: true, force: true });
  renameSync(archive, tree);
  assert.equal(readFileSync(join(admin, "gitdir"), "utf8").trim(), join(tree, ".git"), "the admin folder still names this path");
  assert.equal(sh(dirname(admin), "worktree", "list", "--porcelain").stdout.includes("prunable"), false, "git itself doesn't flag it");
  assert.equal(isRead(tree), false);
  const report = runScript(tree, pathWith(), "--json");
  assert.equal(report.read, false);
  assert.equal(status(report, "browser"), "limited");
  assert.equal(existsSync(join(tree, "loaded")), false, "the folder's own Playwright was loaded");
});

/** Makes a new folder at tree right after the old one is deleted, holding a copy of its .git file and a Playwright that leaves a mark. */
function remake(tree, how) {
  const files = { ...PLAYWRIGHT, ".git": readFileSync(join(tree, ".git"), "utf8") };
  if (how === "tar") {
    // The archive is packed before the delete, so only the unpack makes a folder afterwards.
    const stage = project();
    for (const [path, text] of Object.entries(files)) put(join(stage, "wt"), path, text);
    const archive = join(temp("onrails-path-tar-"), "wt.tar");
    assert.equal(spawnSync(tool("tar"), ["cf", archive, "-C", stage, "wt"], { env: safeEnv() }).status, 0);
    rmSync(tree, { recursive: true, force: true });
    assert.equal(spawnSync(tool("tar"), ["xf", archive, "-C", dirname(tree)], { env: safeEnv() }).status, 0);
    return;
  }
  const saved = join(temp("onrails-path-saved-"), "git");
  copyFileSync(join(tree, ".git"), saved);
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(tree);
  copyFileSync(saved, join(tree, ".git"));
  for (const [path, text] of Object.entries(PLAYWRIGHT)) put(tree, path, text);
}

test("AC-182-3: WHEN the worktree folder is deleted and a new one is made at once at the same path THEN it doesn't count as read, even with the old inode number", posixOnly, (t) => {
  for (const how of ["mkdir", "tar"]) {
    const { tree, admin } = markedTree();
    assert.equal(markRead(tree), tree);
    assert.equal(isRead(tree), true, "the control: the worktree itself was marked");
    const inode = statSync(tree).ino;
    remake(tree, how);
    const back = statSync(tree).ino === inode;
    t.diagnostic(`${how}: the new folder ${back ? "got the old inode number back" : "has another inode number"}`);
    assert.equal(existsSync(join(admin, "onrails-read")), true, "the old mark is still there");
    assert.equal(isRead(tree), false, `${how}: the new folder counts as read`);
    const report = runScript(tree, pathWith(), "--json");
    assert.equal(report.read, false);
    assert.equal(existsSync(join(tree, "loaded")), false, `${how}: the folder's own Playwright was loaded`);
  }
});

/** Runs fn with statSync reporting no birth time, as Node does where the system has none: birth time equals change time. */
function noBirthTime(fn) {
  const real = fs.statSync;
  fs.statSync = (path, opts) => {
    const stats = real(path, opts);
    if (opts?.bigint && stats) stats.birthtimeNs = stats.ctimeNs;
    return stats;
  };
  syncBuiltinESMExports();
  try {
    return fn();
  } finally {
    fs.statSync = real;
    syncBuiltinESMExports();
  }
}

test("AC-182-3: WHEN the system reports no birth time and a worktree folder keeps its inode numbers but its .git file is linked back in THEN the .git file's change time alone keeps it not read", posixOnly, () => {
  const { tree } = markedTree();
  const dot = join(tree, ".git");
  noBirthTime(() => {
    assert.equal(markRead(tree), tree);
    assert.equal(isRead(tree), true, "the control: the worktree itself was marked");
    const folder = statSync(tree).ino;
    const before = statSync(dot, { bigint: true });
    // A clock tick, so a file system with coarse timestamps still gives the relinked file a new change time.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
    // Everything in the folder but .git goes, and the .git file comes back by a new link: the same inode numbers.
    for (const name of readdirSync(tree)) if (name !== ".git") rmSync(join(tree, name), { recursive: true, force: true });
    const aside = join(dirname(tree), "git-aside");
    linkSync(dot, aside);
    unlinkSync(dot);
    linkSync(aside, dot);
    unlinkSync(aside);
    const now = statSync(dot, { bigint: true });
    assert.equal(statSync(tree).ino, folder, "the folder changed, so the test proves nothing about the change time");
    assert.equal(now.ino, before.ino, "the .git file changed, so the test proves nothing about the change time");
    assert.notEqual(now.ctimeNs, before.ctimeNs, "the change time didn't move, so the test proves nothing");
    assert.equal(isRead(tree), false, "only the .git file's change time differs, and it was missed");
  });
});

test("#182: a linked worktree counts as read only once it has been marked itself; marking it marks only it", posixOnly, () => {
  const { main, tree, admin } = markedTree();
  assert.equal(isRead(tree), false, "the main checkout's mark vouched for the worktree");
  assert.equal(markRead(tree), tree);
  assert.equal(isRead(tree), true);
  assert.equal(existsSync(join(admin, "onrails-read")), true, "the worktree's mark lives in its own admin folder");
  // A second worktree of the same repo still needs its own mark, and a mark copied from the first doesn't count.
  const other = join(dirname(tree), "wt2");
  sh(main, "worktree", "add", "--quiet", "--detach", other);
  put(join(main, ".git", "worktrees", "wt2"), "onrails-read", readFileSync(join(admin, "onrails-read"), "utf8"));
  assert.equal(isRead(other), false);
  // Marking a worktree never marks the main checkout.
  const fresh = gitRepo("");
  const side = join(temp("onrails-path-tree-"), "wt");
  sh(fresh, "worktree", "add", "--quiet", "--detach", side);
  assert.equal(markRead(side), side);
  assert.equal(isRead(fresh), false);
});
