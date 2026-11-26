// Harness tests: a fake `claude` on PATH prints canned stream-json, so nothing calls a model.
// Needs the bundled kit for the "with" arm: run `cd cli && npm run bundle` first. The dry run, the real scenarios
// and each scenario's transcripts have their own files (#180).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KIT, KIT_RE, TEST_SCENARIOS, setup, skipWin } from "./harness.mjs";

const GOOD = { steps: [{ text: "1. Who is it for?\nRecommended: flatmates." }], cost: 0.02 };
const BAD = { steps: [{ write: "app.js", content: "x" }, { text: "Built it." }], cost: 0.03 };

test("bad flags and too many runs exit 2", () => {
  const { run } = setup({});
  assert.equal(run("--nope").status, 2);
  assert.equal(run("--max-runs", "41").status, 2);
  const capped = run("--scenarios-dir", TEST_SCENARIOS, "--max-runs", "3");
  assert.equal(capped.status, 2);
  assert.match(capped.stderr, /4 runs planned, above --max-runs 3/);
});

test("pass: with the kit passes, without fails a check; costs and tokens are summed", { skip: skipWin }, () => {
  const { run, resultsFile, calls, results } = setup({ "*": { with: GOOD, without: BAD } });
  const r = run("--scenarios-dir", TEST_SCENARIOS, "--model", "claude-haiku-5-5");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = resultsFile();
  assert.equal(file.runs.length, 1);
  const runRecord = file.runs[0];
  assert.deepEqual(runRecord.scenarios.map((s) => s.verdict), ["pass", "pass"]);
  const alpha = runRecord.scenarios[0];
  assert.deepEqual(alpha.arms.with.checks.map((c) => c.pass), [true, true]);
  assert.deepEqual(alpha.arms.without.checks.map((c) => c.pass), [false, false]);
  assert.equal(alpha.arms.with.costUsd, 0.02);
  assert.equal(runRecord.totals.runs, 4);
  assert.equal(runRecord.totals.costUsd, 0.1); // 2 x 0.02 + 2 x 0.03
  assert.deepEqual(runRecord.totals.tokens, { input: 400, output: 200, cacheRead: 4000, cacheWrite: 800 });
  assert.equal(runRecord.model, "claude-haiku-5-5");
  assert.equal(runRecord.kitVersion, KIT);
  assert.ok(alpha.arms.with.durationMs >= 0);
  assert.match(readdirSync(results).join(" "), new RegExp(`\\d{4}-\\d\\d-\\d\\d-claude-haiku-5-5-${KIT_RE}\\.json`));
  assert.match(r.stdout, /Estimated cost: \*\*\$0\.1000\*\*/);
  assert.match(r.stdout, /Check by hand/);
  // The arm is real: the kit is installed for "with" only, and each arm gets its own call.
  const c = calls();
  assert.deepEqual(c.map((x) => x.arm).sort(), ["with", "with", "without", "without"]);
  assert.ok(c.every((x) => x.prompt.startsWith("Test scenario")));
  assert.ok(c[0].argv.includes("--model") && c[0].argv.includes("claude-haiku-5-5"));
});

test("fail: a failing 'with' check exits 1", { skip: skipWin }, () => {
  const { run, resultsFile } = setup({ "*": { with: BAD, without: BAD } });
  const r = run("--scenarios-dir", TEST_SCENARIOS, "--scenario", "alpha");
  assert.equal(r.status, 1);
  assert.equal(resultsFile().runs[0].scenarios[0].verdict, "fail");
  assert.match(r.stdout, /no recommendation/);
});

test("no difference: both arms pass, so the skill didn't matter, exits 1", { skip: skipWin }, () => {
  const { run, resultsFile } = setup({ "*": { with: GOOD, without: GOOD } });
  const r = run("--scenarios-dir", TEST_SCENARIOS, "--scenario", "alpha");
  assert.equal(r.status, 1);
  assert.equal(resultsFile().runs[0].scenarios[0].verdict, "no-difference");
});

test("timeout: the run is killed, counts as a failure, and its cost is unknown", { skip: skipWin }, () => {
  const { run, resultsFile } = setup({ "*": { with: { ...GOOD, sleep: 30 }, without: BAD } });
  const started = Date.now();
  const r = run("--scenarios-dir", TEST_SCENARIOS, "--scenario", "alpha", "--timeout", "1");
  assert.ok(Date.now() - started < 20_000, "the harness waited for the sleeping run");
  assert.equal(r.status, 1);
  const s = resultsFile().runs[0].scenarios[0];
  assert.equal(s.arms.with.status, "timeout");
  assert.equal(s.arms.with.costUsd, null);
  assert.equal(s.verdict, "fail");
  assert.equal(resultsFile().runs[0].totals.costUnknown, 1);
  assert.match(r.stdout, /1 run\(s\) reported no cost/);
});

test("results are append-only: a second run adds an entry and keeps the first", { skip: skipWin }, () => {
  const { run, resultsFile } = setup({ "*": { with: GOOD, without: BAD } });
  run("--scenarios-dir", TEST_SCENARIOS, "--scenario", "alpha");
  const first = resultsFile().runs[0];
  run("--scenarios-dir", TEST_SCENARIOS, "--scenario", "alpha");
  const file = resultsFile();
  assert.equal(file.runs.length, 2);
  assert.deepEqual(file.runs[0], first);
});

test("--summary appends the markdown summary to a file", { skip: skipWin }, () => {
  const { run, results } = setup({ "*": { with: GOOD, without: BAD } });
  const summaryFile = join(results, "..", "step-summary.md");
  writeFileSync(summaryFile, "before\n");
  run("--scenarios-dir", TEST_SCENARIOS, "--scenario", "beta", "--summary", summaryFile);
  const text = readFileSync(summaryFile, "utf8");
  assert.match(text, /^before\n## Skill evals/);
  assert.match(text, /\| beta \| pass \|/);
});
