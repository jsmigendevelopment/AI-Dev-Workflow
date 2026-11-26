// Tests for the coordinate skill's flow numbers. The expected values are worked out by hand
// from the four merges below, not by running the script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { flow, median, percentile, report } from "../../.agents/skills/coordinate/scripts/flow.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/flow.mjs", import.meta.url));
const NOW = "2026-11-23T12:00:00Z";
const pr = (number, headRefName, createdAt, mergedAt, additions, deletions) => ({ number, headRefName, createdAt, mergedAt, additions, deletions });
// Opened to merged: 1 h, 3 h, 20 h, 1 h. Merges at 09:00, 12:00, next day 06:00, 08:00.
const MERGED = [
  pr(20, "feat/10-list", "2026-11-22T08:00:00Z", "2026-11-22T09:00:00Z", 100, 20),
  pr(21, "feat/11-add-item", "2026-11-22T09:00:00Z", "2026-11-22T12:00:00Z", 200, 0),
  pr(22, "fix/12-tick", "2026-11-22T10:00:00Z", "2026-11-23T06:00:00Z", 50, 10),
  pr(23, "feat/13-split", "2026-11-23T07:00:00Z", "2026-11-23T08:00:00Z", 300, 40),
  pr(9, "feat/3-old", "2026-11-09T08:00:00Z", "2026-11-10T08:00:00Z", 900, 0), // before the window
  pr(24, "feat/14-open", "2026-11-23T09:00:00Z", null, 10, 0), // not merged
];
const ISSUES = [
  { number: 10, createdAt: "2026-11-21T09:00:00Z" }, // 24 h before #20 merged
  { number: 11, createdAt: "2026-11-22T06:00:00Z" }, // 6 h before #21 merged
  { number: 12, createdAt: "2026-11-22T09:30:00Z" }, // 20.5 h before #22 merged
];

test("median and percentile", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 1, 3, 20]), 2);
  assert.equal(percentile([1, 1, 3, 20], 0.85), 20);
  assert.equal(percentile([5, 1, 2, 4, 3, 6, 7, 8, 9, 10], 0.85), 9);
  assert.equal(percentile([], 0.85), null);
});

test("the numbers for a week with four merges", () => {
  const f = flow([...MERGED, ...ISSUES], { days: 7, now: new Date(NOW) });
  assert.equal(f.merged, 4);
  assert.equal(f.perDay, 0.6); // 4 in 7 days
  assert.deepEqual(f.prToMerge, { median: 2, p85: 20 });
  assert.deepEqual(f.issueToMerge, { median: 20.5, counted: 3 });
  assert.equal(f.betweenMerges.median, 3); // gaps of 3 h, 18 h and 2 h
  assert.deepEqual(f.betweenMerges.longest, { from: "2026-11-22T12:00:00Z", to: "2026-11-23T06:00:00Z", hours: 18 });
  assert.equal(f.sinceLastMerge, 4);
  assert.equal(f.changedLines.median, 160); // 60, 120, 200, 340
  assert.deepEqual(f.slowest, [{ number: 22, hours: 20 }, { number: 21, hours: 3 }, { number: 20, hours: 1 }]);
});

test("a shorter window drops the older merges, and no issues means no issue-to-merge time", () => {
  const f = flow(MERGED, { days: 0.5, now: new Date(NOW) });
  assert.equal(f.merged, 2); // the last 12 hours: 06:00 and 08:00 on the 23rd
  assert.deepEqual(f.issueToMerge, { median: null, counted: 0 });
  assert.equal(f.betweenMerges.longest.hours, 2);
  // A merge exactly on the window's edge counts: #21 merged 24 hours before NOW.
  assert.equal(flow(MERGED, { days: 1, now: new Date(NOW) }).merged, 3);
});

test("nothing merged reads plainly", () => {
  const f = flow([], { now: new Date(NOW) });
  assert.equal(f.merged, 0);
  assert.equal(f.sinceLastMerge, null);
  assert.equal(report(f), "flow · last 7 days · nothing merged\n");
});

test("the command prints the report, or JSON, and needs a file", () => {
  const dir = tmp("onrails-flow-");
  put(dir, "merged.json", JSON.stringify(MERGED));
  put(dir, "issues.json", JSON.stringify(ISSUES));
  put(dir, "bad.json", "{");
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env: safeEnv() });
  const text = run("--github", "merged.json", "--github", "issues.json", "--now", NOW);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, [
    "flow · last 7 days · 4 merged (0.6 a day)",
    "pull request to merge: median 2 h, 85% within 20 h",
    "issue to merge: median 20.5 h (3 counted)",
    "between merges: median 3 h, longest 18 h (2026-11-22 12:00 to 2026-11-23 06:00 UTC)",
    "since the last merge: 4 h",
    "size: median 160 changed lines (lockfiles and generated files included)",
    "slowest: #22 (20 h), #21 (3 h), #20 (1 h)",
    "",
  ].join("\n"));
  const json = JSON.parse(run("--github", "merged.json", "--now", NOW, "--days", "0.5", "--json").stdout);
  assert.equal(json.merged, 2);
  assert.equal(run().status, 2);
  assert.equal(run("--github", "missing.json").status, 2);
  assert.equal(run("--github", "bad.json").status, 2);
});
