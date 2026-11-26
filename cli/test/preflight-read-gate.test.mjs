// #169, review round 1: the read gate holds against a .git that isn't the repo's own, a command is started only
// by its full path, the folder "outside the repo" really is outside it, and --mark-read and --if-changed say what they did.
// The real script runs in throwaway repos, with fakes that leave a file behind when they run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { main, probe } from "../src/preflight.mjs";
import { commandFor, isRead, markRead, tempFolders } from "../src/preflight-sys.mjs";
import { logger, put } from "./helpers.mjs";
import { fakeSys, gitRepo, HEALTHY, pathWith, PLAYWRIGHT, project, runScript, sh, status, temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "the fakes are POSIX shell scripts and symlinks" : false };
const PNPM = JSON.stringify({ packageManager: "pnpm@10.28.0" });

/** A repo marked read on this machine that also ships the Playwright fake. Loading it there is fine: it's read. */
function markedRepo() {
  const dir = gitRepo("", PLAYWRIGHT);
  assert.ok(markRead(dir));
  return dir;
}

/** Runs the real script in dir before the read. True when it loaded nothing from the repo. */
function loadsNothing(dir) {
  const report = runScript(dir, pathWith(), "--json");
  return report.read === false && status(report, "browser") === "limited" && !existsSync(join(dir, "loaded"));
}

test("AC-169-5: WHEN a repo's .git entry isn't a folder of its own THEN it counts as not read and preflight loads nothing from the repo", posixOnly, () => {
  const marked = markedRepo();
  // The control: the marked repo itself counts as read, and the launch check loads its Playwright.
  assert.equal(isRead(marked), true);
  assert.equal(status(runScript(marked, pathWith(), "--json"), "browser"), "ok");
  assert.equal(existsSync(join(marked, "loaded")), true);
  for (const target of [join("..", basename(marked), ".git"), join(marked, ".git")]) {
    const copy = project(PLAYWRIGHT);
    assert.equal(dirname(copy), dirname(marked), "the relative link needs the two side by side");
    symlinkSync(target, join(copy, ".git"));
    assert.equal(isRead(copy), false, target);
    assert.equal(loadsNothing(copy), true, target);
  }
});

test("AC-169-5: WHEN a repo's .git file isn't one git made for a linked worktree THEN it counts as not read and preflight loads nothing from the repo", posixOnly, () => {
  const marked = markedRepo();
  for (const absolute of [true, false]) {
    const copy = project({ ...PLAYWRIGHT, ".git": "gitdir: .wt\n", ".wt/gitdir": "../.git\n" });
    const common = absolute ? join(marked, ".git") : relative(join(copy, ".wt"), join(marked, ".git"));
    put(copy, ".wt/commondir", `${common}\n`);
    // The admin folder names the .git file back, as git's own does, but it isn't in the marked repo's worktrees folder.
    assert.equal(isRead(copy), false, common);
    assert.equal(loadsNothing(copy), true, common);
  }
});

test("AC-169-5: a .git file counts only when the folder it names points back at it", posixOnly, () => {
  const marked = markedRepo();
  const tree = join(temp("onrails-read-tree-"), "wt");
  sh(marked, "worktree", "add", "--quiet", "--detach", tree);
  // The control: the real worktree shares the marked repo's mark.
  assert.equal(isRead(tree), true);
  const admin = join(marked, ".git", "worktrees", "wt");
  assert.equal(readFileSync(join(admin, "gitdir"), "utf8").trim(), join(tree, ".git"));
  const copy = project({ ...PLAYWRIGHT, ".git": `gitdir: ${admin}\n` });
  assert.equal(isRead(copy), false);
  assert.equal(loadsNothing(copy), true);
});

test("AC-169-3: WHEN PATH has entries that aren't full paths THEN preflight starts every command by a full path it found", posixOnly, () => {
  const mark = join(temp("onrails-read-mark-"), "ran");
  const fake = `#!/bin/sh\necho x > '${mark}'\nexit 1\n`;
  const dir = gitRepo("", { git: fake, "tools/git": fake, gh: fake, npm: fake });
  for (const name of ["git", "tools/git", "gh", "npm"]) chmodSync(join(dir, name), 0o755);
  const bin = pathWith("git");
  for (const path of [`:${bin}`, `.:${bin}`, `tools:${bin}`, `${bin}::`]) {
    const report = runScript(dir, path, "--json");
    assert.equal(existsSync(mark), false, `PATH ${path.replace(bin, "<bin>")}: a program the repo ships ran`);
    assert.equal(status(report, "git"), "ok", "the real git, found after the relative entries, did the probe");
  }
  // The full path from PATH is what starts, on POSIX as on Windows. A file without its run bit is passed over.
  const plain = temp("onrails-read-plain-");
  put(plain, "git", "");
  assert.deepEqual(commandFor("git", ["status"], { platform: "linux", env: { PATH: `.:${plain}:${bin}` } }), { file: join(bin, "git"), args: ["status"] });
  assert.equal(commandFor("git", ["status"], { platform: "linux", env: { PATH: `.:tools:` } }), null);
});

test("#169: the probes meant to run outside the repo run from a folder whose real path is outside it", posixOnly, async () => {
  const mark = join(temp("onrails-read-mark-"), "ran");
  const config = `[core]\n\tsshCommand = "echo x > ${mark}; false"\n[remote "origin"]\n\turl = ssh://git@127.0.0.1:9/x.git\n`;
  const dir = gitRepo(config);
  mkdirSync(join(dir, "tmp"));
  const report = runScript(dir, { PATH: pathWith("git"), TMPDIR: join(dir, "tmp") }, "--json");
  assert.equal(existsSync(mark), false, "git read the repo's settings from a temp folder inside it");
  assert.equal(status(report, "github"), "limited");
  // With the fake session: every command meant for outside runs outside, and git searches no folder above that one.
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = join(dir, "tmp");
  try {
    const sys = fakeSys({ answers: HEALTHY });
    await probe(dir, sys);
    const away = sys.runs.filter((r) => /^(gh |npm |git ls-remote)/.test(r.line));
    assert.equal(away.length, 4);
    // The folder is gone by now, so its path is compared as written: mkdtemp made it under a real folder.
    for (const r of away) {
      assert.ok(relative(realpathSync(dir), r.cwd).startsWith(".."), `${r.line} ran inside the repo`);
      assert.equal(r.env.GIT_CEILING_DIRECTORIES, dirname(r.cwd), r.line);
    }
  } finally {
    process.env.TMPDIR = saved;
  }
  // No folder outside the repo at all (a repo at the top of the disk): none is offered, and the hooks folder goes.
  const none = tempFolders("/", "linux");
  assert.equal(none.away, null);
  none.remove();
  assert.equal(existsSync(none.hooks), false);
});

test("#169: --mark-read marks only the .git in the folder it is given, never one above it, and says which folder it marked", posixOnly, async () => {
  const top = gitRepo("");
  mkdirSync(join(top, "sub"));
  const log = logger();
  assert.equal(await main([join(top, "sub"), "--mark-read"], { sys: fakeSys(), log }), 1);
  assert.match(log.text(), /not marked/);
  assert.equal(isRead(top), false, "a folder under the repo marked the repo");
  const done = logger();
  assert.equal(await main([top, "--mark-read"], { sys: fakeSys(), log: done }), 0);
  assert.ok(done.text().includes(`Marked this repo read on this machine: ${realpathSync(top)}.`), done.text());
  assert.equal(isRead(join(top, "sub")), true, "once the repo is marked, its folders count as read");
});

test("#169: WHEN --if-changed skips the probes on a repo not marked read THEN it still prints the not-marked note", async () => {
  const dir = project({ "package.json": PNPM, "docs/state.md": "# State\n\n- **Environment:** open: git · checked x · claude · fp 0\n" });
  assert.equal(await main([dir, "--record"], { sys: fakeSys({ answers: HEALTHY }), log: logger() }), 0);
  const log = logger();
  assert.equal(await main([dir, "--if-changed"], { sys: fakeSys({ answers: HEALTHY }), log }), 0);
  assert.match(log.text(), /Skipped the probes/);
  assert.match(log.text(), /no session on this machine has marked it read/);
  const json = logger();
  await main([dir, "--if-changed", "--json"], { sys: fakeSys({ answers: HEALTHY }), log: json });
  const out = JSON.parse(json.text());
  assert.equal(out.skipped, true);
  assert.equal(out.read, false);
  assert.match(out.note, /--mark-read/);
});

test("#169: /back below Full marks the repo read only after the person's step, as /join does; on Full with no wait", () => {
  const skill = (name) => readFileSync(fileURLToPath(new URL(`../../.agents/skills/${name}/SKILL.md`, import.meta.url)), "utf8");
  assert.match(skill("back"), /Below Full, mark it only once the person has confirmed what you looked at, as `\/join` does; on Full, mark it with no wait\./);
  assert.match(skill("join"), /Below Full, mark it only once the person has confirmed what step 1 found\./);
});
