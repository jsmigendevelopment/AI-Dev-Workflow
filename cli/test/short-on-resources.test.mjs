// #171: short on memory, disk or CPU, the agent adapts and never asks the person to free anything. The ladder
// is text the agents read, so AC-1 and AC-2 read the skills. AC-3 applies the TanStack Start pack and reads
// its scripts. AC-4 is the opt-in eval short-on-memory (evals/test/short-on-memory.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addPack } from "../src/add.mjs";
import { logger, read, tmp } from "./helpers.mjs";

const kit = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const section = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));

const RUNGS = ["Stop your own leftovers.", "Run less at once.", "Make each step smaller.", "Lower your own floor", "Split the work.", "Only then wait,"];

test("AC-171-1: ask's \"Try before you block\" lists the resource ladder and never asks the person to free memory, disk or CPU", () => {
  const tryFirst = section(kit(".agents/skills/ask/SKILL.md"), "## Try before you block", "## A running job");
  const ladder = tryFirst.slice(tryFirst.indexOf("**Short on memory, disk or CPU**"));
  assert.match(ladder, /^\*\*Short on memory, disk or CPU\*\* is never the person's to fix and never a reason to stop\. Never ask the person to free memory, disk or CPU\./);
  const at = RUNGS.map((rung, i) => ladder.indexOf(`${i + 1}. **${rung}`));
  assert.ok(at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1])), `the six rungs, in order: ${at}`);
  assert.match(ladder, /never touch a process this session didn't start/);
  assert.match(ladder, /`node \.agents\/skills\/ask\/scripts\/procs\.mjs stop mine`.*Never `stop all`\./);
  assert.match(ladder, /--maxWorkers=1/);
  assert.match(ladder, /measured .*never guessed\. A floor you set yourself is never a reason to wait\./);
  assert.match(ladder, /The wait sends one ℹ️ FYI with the reason and the retry time, never a question\./);
  assert.match(ladder, /on every automation level/);
  assert.match(ladder, /On Full, nothing on this ladder asks\. Below Full, say what you did in one ℹ️ FYI\. Paying is the only reason to ask/);
});

test("AC-171-2: coordinate lowers the number in flight and the check concurrency, never stops the loop, and sends at most one FYI", () => {
  const coordinate = kit(".agents/skills/coordinate/SKILL.md");
  const bullet = coordinate.match(/^ {3}- \*\*Short on memory, disk or CPU\*\*.*$/m)?.[0] ?? "";
  assert.match(bullet, /climb the resource ladder in `ask`'s "Try before you block" yourself, on every level\./);
  assert.match(bullet, /Lower the number in flight to 1 until the shortfall clears/);
  assert.match(bullet, /Lower the check concurrency too: one check at a time, its steps one at a time, one test worker/);
  assert.match(bullet, /The loop never stops for this, and never asks the person to free anything: send at most one ℹ️ FYI for the shortfall/);
  assert.match(bullet, /Never touch a process this session didn't start\./);
  assert.ok(coordinate.indexOf(bullet) > coordinate.indexOf("5. **Act when something reports back"), "in step 5");
  assert.match(coordinate, /or 3 if it's not set, and 1 while the machine is short on memory, disk or CPU \(step 5\)\./, "step 2's limit");
  assert.match(coordinate, /then `test:e2e` if the project has it\. Short on memory\? Run the low-memory form \(step 5\)\./, "step 6.1.3");
});

test("AC-171-3: the TanStack Start pack's check:lowmem runs check's steps one at a time with one test worker", (t) => {
  const dir = tmp();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(addPack("tanstack-start", dir, { log: logger() }), 0);
  const scripts = JSON.parse(read(dir, "package.json")).scripts;
  const steps = (script) => script.split(" && ");
  // One at a time: steps joined by && only, never a lone &, || or a parallel runner, in check or any step it calls.
  const PARALLEL = /(?:^|[^&])&(?:[^&]|$)|\|\||--parallel\b|\brun-p\b|\bconcurrently\b/;
  for (const name of ["check", "check:lowmem", ...steps(scripts["check:lowmem"]).map((s) => s.match(/^pnpm ([\w:]+)$/)?.[1]).filter(Boolean)]) {
    assert.ok(scripts[name], `${name} exists`);
    assert.doesNotMatch(scripts[name], PARALLEL, name);
  }
  // The same steps as check, so the two can't drift; only the test step changes, to one Vitest worker.
  assert.equal(scripts.test, "vitest run");
  assert.deepEqual(steps(scripts["check:lowmem"]), steps(scripts.check).map((s) => (s === "pnpm test" ? "vitest run --maxWorkers=1" : s)));
  assert.doesNotMatch(read(dir, "vitest.config.ts"), /maxWorkers|fileParallelism|poolOptions/, "no config overrides the flag");
  assert.match(read(dir, "README.md"), /^\| `pnpm check:lowmem` +\| the same steps on a machine short of memory: one test worker \(`vitest --maxWorkers=1`\) +\|$/m);
  assert.match(kit(".agents/skills/stack-tanstack-start/SKILL.md"), /`pnpm check:lowmem` runs the same steps, one at a time, with one Vitest worker \(`--maxWorkers=1`\)/);
  // Another pack with a check script names its own flags.
  assert.match(kit(".agents/skills/stack-monorepo-expo/SKILL.md"), /`pnpm check --concurrency=1` runs Turborepo's tasks one at a time\..*exec jest --maxWorkers=1`/);
});

test("#171: the owner's words are a decision row with originator person", () => {
  const row = kit("docs/decisions.md").split("\n").find((l) => l.includes("(#171)") && l.includes("never the person's to fix")) ?? "";
  assert.ok(row.includes('"instead of just running less processes or waiting it paused to ask me...... like....."'), "the owner's words, exact");
  assert.match(row, /\| person \|$/);
});
