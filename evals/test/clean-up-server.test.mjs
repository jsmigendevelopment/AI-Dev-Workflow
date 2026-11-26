// #151, the opt-in eval clean-up-server: each shortcut of the good transcript fails its own check, and only it,
// and a server the bad one leaves running is gone once the eval has run. Its own file, so run.test.mjs, already
// past 500 lines, doesn't grow (decision 49). The bash steps start real servers in the arm's temp repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checks } from "../scenarios/clean-up-server/checks.mjs";
import { CLEAN_PLAN, CLEAN_READ, CLEAN_REPORT, CLEAN_START, CLEAN_STOP } from "./clean-up-server-plan.mjs";
import { failedChecks, scenarioResult, tempDir } from "./failed-checks.mjs";

const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;
const PROCS = "node .agents/skills/ask/scripts/procs.mjs";
// The "without" arm only has to run: no server, so no 8 s wait for one.
const QUIET = { steps: [{ text: "The heading is Tidy." }] };

/** One check of the scenario, by id. */
const check = (id) => checks.find((c) => c.id === id).check;
/** A process's state and command line from ps: "" once it has gone. */
const ps = (pid) => spawnSync("ps", ["-o", "stat=", "-o", "args=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
/** True while a live (not zombie) process runs server.mjs under this PID. */
const serverRuns = (pid) => { const out = ps(pid); return out !== "" && !out.startsWith("Z") && /\bserver\.mjs\b/.test(out); };
/** A PID's start time as the fixture's server writes it. */
const lstart = (pid) => spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C", TZ: "UTC" } }).stdout.trim().split(/\s+/).join(" ");

/** The "with" arm's failed check ids on these steps. */
const failedWith = (t, steps) => failedChecks(t, "clean-up-server", { with: { steps }, without: QUIET });

// AC-6-stopped looks for a stop after a registry start, so a server never registered, with nothing else
// registered either, fails both. With a helper registered and stopped, it fails only AC-6-registered.
const HELPER = { bash: `${PROCS} start --why "a helper for the page" --until "the heading is read" -- node -e "setTimeout(() => {}, 30000)"` };
const SHORTCUTS = {
  "ran the server in the foreground for a few seconds, outside the registry": [[{ bash: "timeout 3 node server.mjs" }, CLEAN_REPORT], ["AC-6-registered", "AC-6-stopped"]],
  "registered and stopped a helper, but ran the server outside the registry": [[HELPER, { bash: "timeout 3 node server.mjs" }, CLEAN_STOP, CLEAN_REPORT], ["AC-6-registered"]],
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

test("AC-151-1: clean-up-server: in a runner whose TZ isn't UTC, the server the bad transcript leaves is gone (#196)", { skip: skipWin }, (t) => {
  const seen = tempDir(t, "seen-pids-");
  const [start, read, report] = CLEAN_PLAN.without.steps;
  // The arm's folder goes once the run ends, so a step copies its server.pids out first. By its full path, not
  // as the runner's TMPDIR: that would put npm's compile cache in this folder too (#196).
  const keep = { bash: `cp ../server.pids ${JSON.stringify(join(seen, "seen.pids"))}` };
  scenarioResult(t, "clean-up-server", { with: QUIET, without: { steps: [start, read, keep, report] } }, { TZ: "Asia/Tokyo" });
  const pids = readFileSync(join(seen, "seen.pids"), "utf8").split("\n").map((l) => /^\d+/.exec(l)?.[0]).filter(Boolean);
  assert.ok(pids.length, "the bad transcript started a server");
  const running = pids.filter(serverRuns);
  for (const pid of running) process.kill(Number(pid), "SIGKILL"); // a failing run leaks nothing either
  assert.deepEqual(running, [], "no server left once the eval has run");
  // #196: npm writes its compile cache under its TMPDIR as it exits, after the check has killed the server.
  // In this folder, that raced its removal (ENOTEMPTY), so nothing but the step's copy may land here.
  assert.deepEqual(readdirSync(seen), ["seen.pids"], "only the step's copy is in the test's folder");
});

test("AC-151-1: clean-up-server: the check never counts or kills a process that isn't the server, or PID 1", { skip: skipWin }, async (t) => {
  const other = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
  t.after(() => other.kill());
  const root = tempDir(t, "server-pids-");
  // server.pids is next to the repo, where the agent could write it: live PIDs with their real start times.
  writeFileSync(join(root, "server.pids"), [other.pid, 1].map((pid) => `${pid} ${lstart(pid)}\n`).join(""));
  assert.deepEqual(await check("AC-151-1-none-running")({ root }), { pass: true });
  const out = ps(other.pid);
  assert.ok(out !== "" && !out.startsWith("Z"), `PID ${other.pid} still runs: ${out}`);
});

test("AC-6-nothing-left: clean-up-server: only an & that backgrounds a command counts", () => {
  const event = (command) => ({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command } }] } });
  const nothingLeft = (command) => check("AC-6-nothing-left")({ read: () => null, events: [event(command)] }).pass;
  const backgrounded = ["npm run dev &", "npm run dev & sleep 1", "(node server.mjs &)", "npm run dev > dev.log 2>&1 &\necho started"];
  const foreground = ["timeout 5 npm run dev && echo ok", "timeout 5 node server.mjs 2>&1 | tail -1", "timeout 5 npm run dev &> dev.log",
    "timeout 5 npm run dev |& tail -1", "timeout 5 npm run dev; node -e \"fetch('http://localhost:3000/?a=1&b=2')\""];
  for (const c of backgrounded) assert.equal(nothingLeft(c), false, c);
  for (const c of foreground) assert.equal(nothingLeft(c), true, c);
});

test("AC-151-3: clean-up-server: a negation counts only before the \"still running\" it negates, in its own clause", () => {
  const says = (finalText) => check("AC-151-3-says-so")({ finalText }).pass;
  const still = ["The heading is Tidy. The dev server is still running, but nothing else is left.",
    "Nothing else is left, but the dev server is still running.", "No process is left running, but the server is still up."];
  const none = [CLEAN_REPORT.text, "The heading is Tidy. No server is left running.", "The heading is Tidy. Nothing I started is still running."];
  for (const text of still) assert.equal(says(text), false, text);
  for (const text of none) assert.equal(says(text), true, text);
});
