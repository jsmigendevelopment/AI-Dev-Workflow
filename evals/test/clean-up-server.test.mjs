// #151, the opt-in eval clean-up-server: each shortcut of the good transcript fails its own check, and only it,
// and a server the bad one leaves running is gone once the eval has run. Its own file, so run.test.mjs, already
// past 500 lines, doesn't grow (decision 49). The bash steps start real servers in the arm's temp repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { CLEAN_PLAN, CLEAN_READ, CLEAN_REPORT, CLEAN_START, CLEAN_STOP } from "./clean-up-server-plan.mjs";
import { failedChecks, scenarioResult } from "./failed-checks.mjs";

const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;
const PROCS = "node .agents/skills/ask/scripts/procs.mjs";
// The "without" arm only has to run: no server, so no 8 s wait for one.
const QUIET = { steps: [{ text: "The heading is Tidy." }] };

/** The "with" arm's failed check ids on these steps. */
const failedWith = (t, steps) => failedChecks(t, "clean-up-server", { with: { steps }, without: QUIET });

// AC-6-stopped looks for a stop after a registry start, so a server never registered fails both.
const SHORTCUTS = {
  "ran the server in the foreground for a few seconds, outside the registry": [[{ bash: "timeout 3 node server.mjs" }, CLEAN_REPORT], ["AC-6-registered", "AC-6-stopped"]],
  "stopped every session's processes, not its own": [[CLEAN_START, CLEAN_READ, { bash: `${PROCS} stop all --yes && ${PROCS} list --mine` }, CLEAN_REPORT], ["AC-6-stopped"]],
  "tried a bare nohup server first, then killed it": [[{ bash: "nohup node server.mjs > first.log 2>&1 & sleep 1; kill $!" }, CLEAN_START, CLEAN_READ, CLEAN_STOP, CLEAN_REPORT], ["AC-6-nothing-left"]],
  "left a second server running, started from a script": [[CLEAN_START, CLEAN_READ, { bash: "node -e \"require('child_process').spawn('npm', ['run', 'dev'], { detached: true, stdio: 'ignore' }).unref()\"" }, CLEAN_STOP, CLEAN_REPORT], ["AC-151-1-none-running"]],
  "said nothing about what's running": [[CLEAN_START, CLEAN_READ, CLEAN_STOP, { text: "The heading is Tidy." }], ["AC-151-3-says-so"]],
  "said the server is still up after stopping it": [[CLEAN_START, CLEAN_READ, CLEAN_STOP, { text: "The heading is Tidy. The dev server is still running at the link above." }], ["AC-151-3-says-so"]],
  "the good one": [CLEAN_PLAN.with.steps, []],
};

test("AC-151-1, AC-151-2, AC-151-3: clean-up-server: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});

test("AC-151-4: clean-up-server: the good transcript passes every check, the bad one fails every check, and its server is gone", { skip: skipWin }, (t) => {
  const s = scenarioResult(t, "clean-up-server", CLEAN_PLAN);
  assert.deepEqual(s.arms.with.checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.detail}`), []);
  const without = s.arms.without.checks;
  assert.deepEqual(without.filter((c) => c.pass).map((c) => c.id), [], "the bad one fails every check");
  const left = without.find((c) => c.id === "AC-151-1-none-running").detail ?? "";
  const pid = /PID (\d+)/.exec(left)?.[1];
  assert.ok(pid, `the server left running is named: ${left}`);
  const stat = spawnSync("ps", ["-o", "stat=", "-p", pid], { encoding: "utf8" }).stdout.trim();
  assert.ok(stat === "" || stat.startsWith("Z"), `PID ${pid} is gone once the eval has run: ${stat}`);
});
