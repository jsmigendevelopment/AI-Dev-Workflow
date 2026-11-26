// #182: before the repo is read, preflight is started only by a route the repo can't change, finds no command in a
// PATH folder inside the repo, and a folder left where a deleted worktree was doesn't count as read.
// The real script runs in throwaway repos, from the repo as the current folder, with fakes that leave a file behind when they run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRead, markRead, realSys } from "../src/preflight-sys.mjs";
import { put } from "./helpers.mjs";
import { gitRepo, pathWith, PLAYWRIGHT, project, runScript, sh, status, temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "the fakes are POSIX shell scripts and symlinks" : false };
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

/** Fakes that each write the PATH they were given to a file named after them in mark, then fail. */
function fakes(dir, names, mark) {
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    put(dir, name, `#!/bin/sh\necho "$PATH" > '${join(mark, name)}'\nexit 1\n`);
    chmodSync(join(dir, name), 0o755);
  }
}
const ran = (mark) => readdirSync(mark).sort();

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
