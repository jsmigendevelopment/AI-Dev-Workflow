// #378: coordinate step 6 checks a pull request's size before review and sends an oversized one back with a split
// brief; build checks its own size before it opens one. These rules are text the agents read, so the tests read the
// shipped skill text. The behaviour is the opt-in eval size-send-back (evals/test/size-send-back.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, unixOnly } from "./helpers.mjs";
import { SCRIPTS, checkout, git } from "./pr-rules-fakes.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const COORDINATE = ".agents/skills/coordinate/SKILL.md";
const BUILD = ".agents/skills/build/SKILL.md";

/** coordinate's step 6, up to step 7. */
const stepSix = () => {
  const text = read(COORDINATE);
  const start = text.indexOf("6. **Check each pull request, in order.");
  assert.ok(start > 0, "found step 6");
  return text.slice(start, text.indexOf("\n7. **Merge through one queue,**", start));
};
/** The size-first bullet of step 6. */
const sizeFirst = () => {
  const line = stepSix().split("\n").find((l) => l.includes("**Size first**")) ?? "";
  assert.ok(line, "step 6 has a **Size first** bullet");
  return line;
};

test("AC-378-1: WHEN a pull request is over the limit with no exception THEN step 6 runs pr-size.mjs before the clone and the code review, and an exit 1 gets no review", () => {
  const six = stepSix();
  const size = sizeFirst();
  assert.match(size, /`node \.agents\/skills\/coordinate\/scripts\/pr-size\.mjs <n> --repo <owner>\/<repo>`/);
  assert.ok(six.indexOf("**Size first**") < six.indexOf("2. Make a clean clone of the head"), "the size check comes before the clone");
  assert.ok(six.indexOf("**Size first**") < six.indexOf("2. **Code review.**"), "the size check comes before the code review");
  assert.match(size, /Exit 1[^.]*: no clone, no checks, no review and no `qa`/);
  assert.match(size, /not a review round: it doesn't count toward the review cap/);
  assert.match(size, /Exit 2: as `pr-rules\.mjs` exit 2/);
  assert.match(size, /Local mode: `pr-size\.mjs --base main --head <sha>` from your checkout of main, before the review/);
});

test("AC-378-1: WHEN it goes back THEN a fresh builder gets the split brief: stacked pull requests, or child issues with this one narrowed to the first", () => {
  const size = sizeFirst();
  assert.match(size, /a fresh builder on the same branch/);
  assert.match(size, /`Sent back · <sha> · size: <count> counted lines, over 1,000`/);
  assert.match(size, /file child issues through `issues`, each under 1,000, and narrow this pull request to the first/);
  assert.match(size, /stack it: pull requests of under 1,000 each, each based on the branch before it/);
  assert.match(size, /`size-exception` label and a `Size exception: <reason>` line/);
});

test("AC-378-2: WHEN it's under the limit THEN the loop goes straight on to the checks and review, as today", () => {
  assert.match(sizeFirst(), /Exit 0: go on to 6\.1\.2, as before\./);
  // The size rule in 6.1.3 stays: pr-rules.mjs still fails a head that grew after the size check.
  assert.match(stepSix(), /\*\*The size rule\*\* is `pr-size\.mjs`'s, which `pr-rules\.mjs` shares \(#377\)/);
});

test("#378: build checks its own size with pr-size.mjs before it opens the pull request, and splits first when over", () => {
  const build = read(BUILD);
  const step12 = build.slice(build.indexOf("12. **Open the pull request"), build.indexOf("\n13. "));
  assert.match(step12, /\*\*Check your size first:\*\* `node \.agents\/skills\/coordinate\/scripts\/pr-size\.mjs --base origin\/main`/);
  assert.match(step12, /Exit 1\? Split before you open it/);
  assert.match(step12, /`size-exception` label and a `Size exception: <reason>` line/);
  assert.doesNotMatch(build, /about 400 changed lines/);
  assert.doesNotMatch(build, /large-pr/);
});

test("#378: pr-size.mjs --base main --head <ref> counts that commit from a checkout of main, without switching to it", unixOnly, () => {
  const dir = checkout();
  git(dir, "branch", "-M", "main");
  git(dir, "switch", "-q", "-c", "feat/1-report");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/report.mjs"), Array.from({ length: 1200 }, (_, i) => `export const row${i} = ${i};`).join("\n") + "\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "#1 Chore report");
  git(dir, "switch", "-q", "main");
  const size = (...args) => spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), ...args], { cwd: dir, encoding: "utf8", env: safeEnv() });
  const big = size("--base", "main", "--head", "feat/1-report");
  assert.equal(big.status, 1, big.stderr);
  assert.match(big.stdout, /^feat\/1-report against main: 1200 changed lines counted/);
  assert.match(big.stdout, /1200\tsrc\/report\.mjs/);
  const here = size("--base", "main");
  assert.equal(here.status, 0, here.stderr);
  assert.match(here.stdout, /^HEAD against main: 0 changed lines counted/);
  for (const bad of [["--base", "main", "--head"], ["--base", "main", "--head", "-x"], ["--base", "main", "--tail", "x"], ["--base", "main", "--head", "nope"]]) {
    assert.equal(size(...bad).status, 2, bad.join(" "));
  }
});
