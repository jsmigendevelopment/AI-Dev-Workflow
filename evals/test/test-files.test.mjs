// #180: run.test.mjs went past the 500-line stop and was split by job. Every file stays under it, and no test was
// lost or copied on the way: each title the file had before the split is in exactly one test file now.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const MAX_LINES = 500;

// run.test.mjs's test titles before the split, as `node --test` listed them.
const BEFORE_SPLIT = [
  "dry run prints the plan, needs no claude and writes nothing",
  "an opt-in scenario runs when --scenario names it",
  "bad flags and too many runs exit 2",
  "pass: with the kit passes, without fails a check; costs and tokens are summed",
  "fail: a failing 'with' check exits 1",
  "no difference: both arms pass, so the skill didn't matter, exits 1",
  "timeout: the run is killed, counts as a failure, and its cost is unknown",
  "results are append-only: a second run adds an entry and keeps the first",
  "--summary appends the markdown summary to a file",
  "every real scenario passes a good transcript and fails a bad one",
  "auto-grill-door: buried or kept float picks fail, door-first reviews pass",
  "AC-5: one-prompt: a door Pick without \"AI pick, not reviewed\" fails",
  "AC-5: one-prompt: waits and loops that never built issue 1 fail first-issue-built, and only it",
  "AC-5: one-prompt: an ask tool fails no-ask-tool; a soft line after building passes",
  "AC-131-4: ci-never-starts: each skipped part of the local gate fails its own check, and only it",
  "AC-100-5: preflight-blocked: fixes sent one at a time fail one-message and one-ping, and only those; one batched message passes",
  "AC-100-5: asked-once: a repeated strongest-tier question fails tier-not-asked-again, and only it; asking nothing passes",
  "AC-127-2: test-by-hand-zero: each skipped part of the hand test fails its own checks, and only them",
];

const files = readdirSync(HERE, { recursive: true }).map((name) => name.split(/[\\/]/).join("/")).filter((name) => name.endsWith(".mjs"));
const lines = (name) => readFileSync(join(HERE, name), "utf8").trimEnd().split("\n").length;
// The titles written as a plain double-quoted string in test("...", ...). Template titles are made in loops, and none
// of the old ones is one.
const titles = (name) => [...readFileSync(join(HERE, name), "utf8").matchAll(/\btest\(\s*("(?:[^"\\\n]|\\.)*")/g)].map((m) => JSON.parse(m[1]));

test("AC-180-1: WHEN the eval tests run THEN no test file is over 500 lines, and every test title from before the split appears exactly once", () => {
  assert.deepEqual(files.filter((name) => lines(name) > MAX_LINES), [], `split any file over ${MAX_LINES} lines by job`);
  const all = files.filter((name) => name.endsWith(".test.mjs")).flatMap(titles);
  const counts = Object.fromEntries(BEFORE_SPLIT.map((title) => [title, all.filter((t) => t === title).length]));
  assert.deepEqual(counts, Object.fromEntries(BEFORE_SPLIT.map((title) => [title, 1])));
});
