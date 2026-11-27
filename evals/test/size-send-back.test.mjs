// The opt-in eval size-send-back (#378): coordinate step 6 checks a pull request's size before review. Each shortcut
// of the good transcript fails its own check, and the fixture really is over and under the limit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DONE, MERGE_ONE, MERGE_TWO, REVIEW_ONE, REVIEW_TWO, SIZE_ONE, SIZE_PLAN, SIZE_TWO, SPLIT_BRIEF, SPLIT_CHILD } from "./size-send-back-plan.mjs";
import { failedChecks, tempDir } from "./failed-checks.mjs";
import { git } from "../lib/fixture.mjs";

const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));
const SCRIPTS = ".agents/skills/coordinate/scripts";
const KIT_SCRIPTS = fileURLToPath(new URL(`../../${SCRIPTS}`, import.meta.url));
const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

/** The "with" arm's failed check ids on these steps. */
const failedWith = (t, steps) => failedChecks(t, "size-send-back", { with: { steps }, without: SIZE_PLAN.without });

const SHORTCUTS = {
  "AC-378-1 no size check": [[SPLIT_BRIEF, REVIEW_TWO, MERGE_TWO, DONE], ["AC-378-1-size-checked"]],
  "AC-378-1 #1 reviewed anyway": [[SIZE_ONE, REVIEW_ONE, SPLIT_BRIEF, SIZE_TWO, REVIEW_TWO, MERGE_TWO, DONE], ["AC-378-1-no-review"]],
  "AC-378-1 #1 merged anyway": [[SIZE_ONE, MERGE_ONE, SPLIT_BRIEF, SIZE_TWO, REVIEW_TWO, MERGE_TWO, DONE], ["AC-378-1-no-review"]],
  "AC-378-1 no split brief": [[SIZE_ONE, SIZE_TWO, REVIEW_TWO, MERGE_TWO, DONE], ["AC-378-1-split-brief"]],
  "AC-378-1 a child issue is a split": [[SIZE_ONE, SPLIT_CHILD, SIZE_TWO, REVIEW_TWO, MERGE_TWO, DONE], []],
  "AC-378-2 #2 not reviewed": [[SIZE_ONE, SPLIT_BRIEF, SIZE_TWO, DONE], ["AC-378-2-reviewed"]],
  "AC-378-2 a review alone": [[SIZE_ONE, SPLIT_BRIEF, SIZE_TWO, REVIEW_TWO, DONE], []],
};

test("AC-378-1 and AC-378-2: size-send-back: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});

test("AC-378-1 and AC-378-2: the fixture's #1 is over the limit and #2 is under it, by the kit's own pr-size.mjs", { skip: skipWin }, async (t) => {
  const { build } = await import("../scenarios/size-send-back/fixture.mjs");
  const dir = join(tempDir(t), "repo");
  const meta = build(dir);
  // Installed untracked, as `onrails init` puts the kit in the "with" arm: pr-size.mjs counts the checkout it is in.
  mkdirSync(join(dir, SCRIPTS), { recursive: true });
  for (const name of ["pr-size.mjs", "agent-files.mjs", "command-for.mjs"]) copyFileSync(join(KIT_SCRIPTS, name), join(dir, SCRIPTS, name));
  const size = (head) => spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), "--base", "main", "--head", head], { cwd: dir, encoding: "utf8" });
  const big = size(meta.big);
  assert.equal(big.status, 1, big.stdout + big.stderr);
  assert.match(big.stdout, /src\/report\.mjs/);
  const small = size(meta.small);
  assert.equal(small.status, 0, small.stdout + small.stderr);
  assert.equal(git(dir, "rev-parse", "feat/1-report"), meta.big);
  assert.equal(git(dir, "rev-parse", "feat/2-count"), meta.small);
});

const dry = (...args) => spawnSync(process.execPath, [RUN, "--dry-run", ...args, "--results-dir", join(tmpdir(), "evals-never")], { encoding: "utf8", env: { ...process.env, PATH: "" } });

test("AC-378-1: size-send-back is opt-in, and --scenario lists it and its checks", () => {
  const r = dry();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Opt-in, not in this run: .*\bsize-send-back\b/m);
  assert.doesNotMatch(r.stdout, /size-send-back \[with\]/);
  const named = dry("--scenario", "size-send-back");
  assert.equal(named.status, 0, named.stderr);
  assert.match(named.stdout, /size-send-back \[with\]/);
  for (const id of ["AC-378-1-size-checked", "AC-378-1-no-review", "AC-378-1-split-brief", "AC-378-2-reviewed"]) assert.match(named.stdout, new RegExp(id));
});
