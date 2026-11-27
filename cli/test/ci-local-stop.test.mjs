// #203: after a stop signal, ci local prints no failure line for a step it skipped; update and update --all pass the
// stop on and run nothing after it; docs/stack.md committed as a folder stops with a plain message. A fake `run`
// stands in for git and gh, and emits the signal on the issue call, as a stop that lands while gh opens it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { constants } from "node:os";
import { dirname } from "node:path";
import { ciLocal } from "../src/ci-local.mjs";
import { init } from "../src/init.mjs";
import { realSystem } from "../src/system.mjs";
import { update } from "../src/update.mjs";
import { updateAll } from "../src/update-all.mjs";
import { logger, makeKit, put, tmp } from "./helpers.mjs";

const FULL = "# Stack\n\n## Automation level\n\n- **Level:** full\n";
const ISSUE = "gh api --method POST repos/acme/app/issues";
const TERM = 128 + constants.signals.SIGTERM;

function repo({ stackAsFolder = false } = {}) {
  const dir = tmp();
  put(dir, ".github/workflows/ci.yml", "on: push\n");
  if (stackAsFolder) put(dir, "docs/stack.md/x.md", "a folder\n");
  else put(dir, "docs/stack.md", FULL);
  return dir;
}

/** git and gh, faked; `signal` is emitted to this process while the issue is being opened. */
function fakeRun(dir, { signal } = {}) {
  const calls = [];
  const run = (cmd, args) => {
    const line = [cmd, ...args].join(" ");
    calls.push(line);
    if (line.startsWith("git worktree add")) {
      mkdirSync(args.at(-2), { recursive: true });
      cpSync(dir, args.at(-2), { recursive: true });
    }
    if (line.startsWith(ISSUE)) {
      if (signal) process.emit(signal, signal);
      return { ok: true, out: JSON.stringify({ number: 7 }) };
    }
    if (line === "git rev-parse --show-toplevel") return { ok: true, out: dir };
    if (line === "git remote get-url origin") return { ok: true, out: "git@github.com:acme/app.git" };
    if (line === "gh api repos/acme/app") return { ok: true, out: JSON.stringify({ default_branch: "main" }) };
    if (line === "git status --porcelain") return { ok: true, out: " D .github/workflows/ci.yml" };
    return { ok: true, out: "" };
  };
  return { run, calls };
}

const after = (calls) => calls.slice(calls.findIndex((c) => c.startsWith(ISSUE)) + 1);

test("AC-203-1: WHEN ci local is stopped by a signal THEN the output has no failure line for a step that didn't run", async () => {
  const dir = repo(), fake = fakeRun(dir, { signal: "SIGTERM" }), log = logger();
  assert.equal(await ciLocal(dir, { log, run: fake.run }), TERM, log.text());
  assert.match(log.text(), /Stopped by SIGTERM before its next step/);
  assert.doesNotMatch(log.text(), /failed|Couldn.t/, log.text());
  assert.ok(!after(fake.calls).some((c) => c.startsWith("git switch")), "the switch never ran");
});

test("AC-203-2: WHEN ci local inside update is stopped by a signal THEN update exits non-zero and runs no later step", async () => {
  const dir = repo();
  init(dir, { kitDir: makeKit("0.1.0", { "AGENTS.md": "v1\n" }), log: logger() });
  const fake = fakeRun(dir, { signal: "SIGTERM" }), log = logger();
  assert.equal(await update(dir, { kitDir: makeKit("0.2.0", { "AGENTS.md": "v2\n" }), log, run: fake.run }), TERM, log.text());

  const again = repo();
  init(again, { kitDir: makeKit("0.1.0", { "AGENTS.md": "v1\n" }), log: logger() });
  const all = fakeRun(again, { signal: "SIGTERM" }), out = logger();
  // No tool on PATH and an empty home: the plugin step skips, so the run goes straight to the project kit.
  const sys = { ...realSystem({ projectDir: again, env: { PATH: "" } }), home: tmp("onrails-home-") };
  assert.equal(await updateAll(again, { kitDir: makeKit("0.2.0", { "AGENTS.md": "v2\n" }), sys, log: out, run: all.run }), TERM, out.text());
  assert.doesNotMatch(out.text(), /4\. doctor|Summary/, "nothing after the stop");
});

test("AC-203-3: WHEN docs/stack.md is a folder THEN the run stops with a plain message, exit 1, no stack trace, and the worktree is removed", async () => {
  const dir = repo({ stackAsFolder: true }), fake = fakeRun(dir), log = logger();
  assert.equal(await ciLocal(dir, { log, run: fake.run, yes: true }), 1, log.text());
  assert.match(log.text(), /Stopped: docs\/stack\.md is a folder/);
  assert.doesNotMatch(log.text(), /EISDIR|\n\s+at /);
  assert.ok(fake.calls.some((c) => c.startsWith("git worktree remove --force")), "the worktree is removed");
  const tree = fake.calls.find((c) => c.startsWith("git worktree add")).split(" ").at(-2);
  assert.ok(!existsSync(dirname(tree)), "and its temp folder");
  assert.ok(!fake.calls.some((c) => c.startsWith(ISSUE)) && existsSync(dir));
});
