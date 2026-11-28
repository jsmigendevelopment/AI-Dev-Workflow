// The dry run: it prints the plan and runs nothing, so it needs no claude (#180, split from run.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUN } from "./harness.mjs";

test("dry run prints the plan, needs no claude and writes nothing", () => {
  const r = spawnSync(process.execPath, [RUN, "--dry-run", "--results-dir", join(tmpdir(), "evals-never")], { encoding: "utf8", env: { ...process.env, PATH: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Dry run: 40 run\(s\)/);
  assert.match(r.stdout, /--max-turns 12/);
  assert.match(r.stdout, /--output-format stream-json --verbose/);
  assert.match(r.stdout, /--permission-mode dontAsk/);
  assert.match(r.stdout, /idea-grill \[with\]/);
  assert.match(r.stdout, /one-prompt: its own limits, 60 turns, 600 s, \$1\.5 budget/);
  assert.match(r.stdout, /preflight-blocked: its own limits, 24 turns, 240 s, \$0\.5 budget/);
  const optIn = r.stdout.match(/^Opt-in, not in this run: (.+)\. Name them with --scenario\.$/m)?.[1].split(", ") ?? [];
  assert.deepEqual(optIn.sort(), ["back-on-full", "ci-never-starts", "clean-up-server", "decision-lifts-gate", "full-never-parks", "live-thread-loop", "live-thread-only-talks", "short-on-memory", "size-send-back", "test-by-hand-zero", "voice-reading"]);
  assert.match(r.stdout, /Opt-in, not in this run: back-on-full, ci-never-starts, clean-up-server, decision-lifts-gate, full-never-parks, live-thread-loop, live-thread-only-talks, short-on-memory, size-send-back, test-by-hand-zero, voice-reading\. Name them with --scenario\./);
  assert.doesNotMatch(r.stdout, /test-by-hand-zero \[with\]/);
  assert.doesNotMatch(r.stdout, /ci-never-starts \[with\]/);
  assert.ok(!existsSync(join(tmpdir(), "evals-never")));
});

test("an opt-in scenario runs when --scenario names it", () => {
  const r = spawnSync(process.execPath, [RUN, "--dry-run", "--scenario", "test-by-hand-zero"], { encoding: "utf8", env: { ...process.env, PATH: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Dry run: 2 run\(s\)/);
  assert.match(r.stdout, /test-by-hand-zero: its own limits, 20 turns, 240 s, \$0\.5 budget/);
  assert.doesNotMatch(r.stdout, /Opt-in, not in this run/);
  const ci = spawnSync(process.execPath, [RUN, "--dry-run", "--scenario", "ci-never-starts"], { encoding: "utf8", env: { ...process.env, PATH: "" } });
  assert.equal(ci.status, 0, ci.stderr);
  assert.match(ci.stdout, /Dry run: 2 run\(s\)/);
  assert.match(ci.stdout, /ci-never-starts: its own limits, 24 turns, 300 s, \$0\.5 budget/);
});
