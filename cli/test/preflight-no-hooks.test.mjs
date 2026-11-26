// #232: when no empty hooks folder that only this user can write can be made, the repo's own hooks still never run
// before the read. On POSIX git gets a hooks path that can hold no hook; elsewhere the temp branch waits for the read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { probe } from "../src/preflight.mjs";
import { realSys } from "../src/preflight-sys.mjs";
import { fakeSys, gitRepo, HEALTHY, pathWith, sh, status, temp } from "./preflight-fakes.mjs";

const posixOnly = { skip: process.platform === "win32" ? "POSIX hooks and modes" : false };
const NO_BASES = { bases: [] };
// The git calls that run in the repo and can start one of its hooks: the temp branch, or the temp config key.
const writes = (sys) => sys.calls.filter((line) => /^git (-c \S+ )*(rev-parse|branch|config)\b/.test(line));

test("AC-232-1: WHEN no safe hooks folder can be made on a platform with no hooks path that holds nothing THEN git runs nothing in the repo before the read", async () => {
  const sys = { ...fakeSys({ answers: HEALTHY }), platform: "win32" };
  const report = await probe(temp("onrails-nohooks-repo-"), sys, {}, NO_BASES);
  assert.equal(status(report, "git"), "limited");
  assert.match(report.results.find((r) => r.id === "git").detail, /checked after the repo is read/);
  assert.deepEqual(writes(sys), [], "git ran in the repo with its own hooks on");
});

test("AC-232-1: WHEN no safe hooks folder can be made on POSIX THEN every git call in the repo gets a hooks path that holds no hook", posixOnly, async () => {
  const sys = fakeSys({ answers: HEALTHY });
  const repo = temp("onrails-nohooks-repo-");
  const report = await probe(repo, sys, {}, NO_BASES);
  assert.equal(status(report, "git"), "ok");
  const inRepo = sys.runs.filter((r) => r.line.startsWith("git ") && r.cwd === repo);
  assert.ok(inRepo.length >= 3, "the control: the git row ran");
  for (const run of inRepo) assert.deepEqual(run.config, ["core.hooksPath=/dev/null"], run.line);
});

test("AC-232-1: WHEN no safe hooks folder can be made THEN the repo's own hook doesn't run on the temp branch", posixOnly, async () => {
  const repo = gitRepo("");
  const ran = join(repo, "hook-ran");
  const hook = join(repo, ".git", "hooks", "reference-transaction");
  writeFileSync(hook, `#!/bin/sh\ntouch '${ran}'\n`);
  chmodSync(hook, 0o755);
  sh(repo, "branch", "control");
  assert.ok(existsSync(ran), "the control: the hook runs when git makes a branch");
  sh(repo, "branch", "-D", "control");
  rmSync(ran);
  const env = { PATH: pathWith("git"), HOME: temp("onrails-nohooks-home-") };
  const report = await probe(repo, realSys({ env }), {}, NO_BASES);
  assert.equal(report.results.find((r) => r.id === "git").detail, "made and deleted a temp branch");
  assert.equal(existsSync(ran), false, "the repo's hook ran before the read");
});
