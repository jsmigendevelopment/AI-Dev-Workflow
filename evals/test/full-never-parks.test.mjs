// The opt-in eval full-never-parks (#208): each shortcut of the good transcript fails its own check.
// Its own file, like each scenario's transcript tests (#180).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PARK_BUILD, PARK_LABEL, PARK_MERGE, PARK_PLAN, PARK_ROUND, PARK_SPLIT } from "./full-never-parks-plan.mjs";
import { failedChecks } from "./failed-checks.mjs";

const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));
const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

/** The "with" arm's failed check ids on these steps. */
const failedWith = (t, steps) => failedChecks(t, "full-never-parks", { with: { steps }, without: PARK_PLAN.without });

const DONE = { text: "Built and merged #2. #1 moved on; nothing waits on you." };
const SHORTCUTS = {
  "AC-208-3 asked about #1": [[PARK_ROUND, PARK_BUILD, PARK_MERGE, { text: "Merged #2. #1 is at the review cap: should I split it?" }], ["AC-208-no-ask"]],
  "AC-208-3 asked nothing": [[PARK_ROUND, PARK_BUILD, PARK_MERGE, DONE], []],
  "AC-208-4 labelled #1 needs-human": [[PARK_ROUND, PARK_BUILD, PARK_MERGE, PARK_LABEL, DONE], ["AC-208-no-needs-human"]],
  "AC-208-5 neither a round nor a split": [[PARK_BUILD, PARK_MERGE, DONE], ["AC-208-moved-on"]],
  "AC-208-5 a split alone": [[PARK_SPLIT, PARK_BUILD, PARK_MERGE, DONE], []],
  "AC-208-6 #2 built, not merged": [[PARK_ROUND, PARK_BUILD, DONE], ["AC-208-two-merged"]],
  "AC-208-6 #2 not built": [[PARK_ROUND, DONE], ["AC-208-two-merged"]],
};

test("AC-208-3 to AC-208-6: full-never-parks: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});

const dry = (...args) => spawnSync(process.execPath, [RUN, "--dry-run", ...args, "--results-dir", join(tmpdir(), "evals-never")], { encoding: "utf8", env: { ...process.env, PATH: "" } });

test("AC-208-1: full-never-parks is opt-in: the default dry run doesn't run it", () => {
  const r = dry();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Opt-in, not in this run: .*\bfull-never-parks\b/m);
  assert.doesNotMatch(r.stdout, /full-never-parks \[with\]/);
});

test("AC-208-2: --scenario full-never-parks lists it and its checks", () => {
  const r = dry("--scenario", "full-never-parks");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /full-never-parks \[with\]/);
  for (const id of ["AC-208-no-ask", "AC-208-no-needs-human", "AC-208-moved-on", "AC-208-two-merged"]) assert.match(r.stdout, new RegExp(id));
});
