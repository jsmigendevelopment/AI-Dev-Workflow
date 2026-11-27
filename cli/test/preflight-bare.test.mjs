// #195: the folder that holds a bare repo is no checkout, a PATH entry left off as unreadable waits for the read,
// and every preflight master stays under 300 lines with its copies in step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathOutside } from "../src/preflight-layout.mjs";
import { gitRepo, runScript, sh, status, temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "POSIX paths" : false };
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("AC-1: WHEN preflight runs in a worktree of ~/proj.git THEN tools under the home folder outside that repo's checkouts are still found before the read", posixOnly, () => {
  const home = temp("onrails-bare-home-");
  sh(home, "clone", "--quiet", "--bare", gitRepo(""), "proj.git");
  const tree = join(home, "wt");
  sh(join(home, "proj.git"), "worktree", "add", "--quiet", "--detach", tree);
  const tools = join(home, "tools");
  mkdirSync(tools);
  assert.deepEqual(pathOutside(tree, "linux", { PATH: tools }), { PATH: realpathSync.native(tools) });
  // The control: a folder in the worktree is still left off.
  assert.deepEqual(pathOutside(tree, "linux", { PATH: join(tree) }), { PATH: "" });
});

test("AC-2: WHEN a PATH entry is dropped because a .git above it can't be read THEN its row reads \"limited: checked after the repo is read\"", posixOnly, () => {
  const odd = temp("onrails-bare-odd-");
  // A .git file git would never write, too big to read as one: the layout above the folder can't be read.
  writeFileSync(join(odd, ".git"), "x".repeat(5000));
  const bin = join(odd, "bin");
  mkdirSync(bin);
  const unread = { count: 0 };
  assert.deepEqual(pathOutside(gitRepo(""), "linux", { PATH: bin }, undefined, [], unread), { PATH: "" });
  assert.equal(unread.count, 1);
  const report = runScript(gitRepo(""), bin, "--json");
  assert.equal(report.read, false);
  const git = report.results.find((r) => r.id === "git");
  assert.equal(status(report, "git"), "limited");
  assert.match(git.detail, /checked after the repo is read$/);
  assert.doesNotMatch(git.detail, /isn't installed$/);
});

test("AC-3: WHEN the tests run THEN no preflight master is over 300 lines and every copy matches its master", () => {
  const masters = readdirSync(join(ROOT, "scripts")).filter((f) => /^preflight.*\.mjs$/.test(f));
  assert.ok(masters.includes("preflight-output.mjs") && masters.includes("preflight-versions.mjs"));
  for (const file of masters) {
    const text = readFileSync(join(ROOT, "scripts", file), "utf8");
    assert.ok(text.split("\n").length <= 300, `${file} is over 300 lines`);
    for (const copy of ["cli/src", ".agents/skills/ask/scripts"]) {
      assert.equal(readFileSync(join(ROOT, copy, file), "utf8"), text, `${copy}/${file} differs from its master`);
    }
  }
});
