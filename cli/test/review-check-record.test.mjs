// #417: in the kit's own repo the reviewer runs the checks (decision 28), so `pr-review` ends its `Checks:` comment
// with an `insights.mjs line check` line. The coordinator's harvest then finds a `check` record for the reviewed head,
// and `has-records` (#333) doesn't send the pull request back for a second check run. The printed command runs in a
// temp git repo standing in for the coordinator's checkout of main, next to fake gh, claude and codex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { fake, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { parseLine, validate } from "../src/insights-record.mjs";
import { JOB, ME, REPO, REVIEW, SCRIPTS, SHA, git, json, pathOf, put, run } from "./insights-land-fakes.mjs";

const SKILL = readFileSync(join(REPO, ".agents/skills/pr-review/SKILL.md"), "utf8");

/** The path where the reviewer runs the checks itself: from "Briefed to run them yourself?" up to check 2. */
function selfRunPath() {
  const start = SKILL.indexOf("Briefed to run them yourself?");
  assert.ok(start > 0, "pr-review has the path where the reviewer runs the checks");
  return SKILL.slice(start, SKILL.indexOf("\n2. **", start));
}

/** The `insights.mjs line check` command that path prints, as written in the skill. */
function printedCommand() {
  const command = /`(node \.agents\/skills\/coordinate\/scripts\/insights\.mjs line check [^`]+)`/.exec(selfRunPath())?.[1];
  assert.ok(command, "the path names the full insights.mjs line check command");
  return command;
}

// Fake values for each placeholder the command may hold. A placeholder not listed here fails the test, so the
// command and this list can't drift apart unseen.
const FAKES = {
  "<pr>": "40",
  "<sha>": SHA,
  "<commands>": JSON.stringify([
    { name: "node scripts/sync-skills.mjs --check", result: "pass", seconds: 3 },
    { name: "cd cli && npm run bundle && npm test", result: "pass", seconds: 61 },
  ]),
  "<success|failure>": "success",
  "<failed>": "null",
  "<rerun>": "false",
  "<fence>": "Fence: bubblewrap",
};

function withFakes(command) {
  return command.replace(/<[^<>]+>/g, (name) => {
    assert.ok(Object.hasOwn(FAKES, name), `a fake value for ${name}`);
    return FAKES[name];
  });
}

/** A temp git repo standing in for the coordinator's checkout of main, with the coordinate scripts and `records`. */
function checkout(records) {
  const dir = tmp("onrails-review-check-");
  git(dir, "init", "-q", "-b", "main");
  cpSync(join(REPO, SCRIPTS), join(dir, SCRIPTS), { recursive: true });
  records.forEach((r, i) => put(dir, pathOf(r, `${i}`.padStart(6, "0")), json(r)));
  return dir;
}

/** Runs the printed command through a shell, as the reviewer pastes it, with fake claude and codex on PATH. */
function runPrinted(dir, command) {
  const bin = tmp("onrails-review-bin-");
  const log = join(bin, "agents.log");
  for (const name of ["claude", "codex", "gh"]) fake(bin, name, `#!/bin/sh\necho "${name} $*" >> '${log}'\n`);
  const env = safeEnv({ ONRAILS_NOW: "2026-11-27T14:20:00Z" }, { bins: [bin], cwd: dir });
  const r = spawnSync("/bin/sh", ["-c", command], { cwd: dir, encoding: "utf8", env });
  return { ...r, calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

test("AC-417-1: WHEN pr-review/SKILL.md is read THEN the path where the reviewer runs the checks names insights.mjs line check with pr, sha and commands", () => {
  const path = selfRunPath();
  assert.match(path, /insights\.mjs line check/);
  const command = printedCommand();
  assert.match(command, /\bpr=<pr>/);
  assert.match(command, /\bsha=<sha>/);
  assert.match(command, /\bcommands=/);
  assert.match(path, /`Checks:` comment/, "the line goes at the end of the Checks: comment");
  assert.match(path, /never type the JSON by hand/i);
});

test("AC-417-1: WHEN the reviewer runs the checks itself THEN mark-check.mjs runs without --record, so the line is the one check record", () => {
  assert.match(selfRunPath(), /`mark-check\.mjs` without `--record`/);
});

test("AC-417-2: WHEN the printed command runs with fake values THEN it exits 0, its record passes validate, and after a harvest of a comment holding it has-records finds the check record", unixOnly, () => {
  const dir = checkout([JOB, REVIEW]);
  const printed = runPrinted(dir, withFakes(printedCommand()));
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.calls, "", "no claude, codex or gh call");
  const record = JSON.parse(/<!-- onrails-insights (\{.*\}) -->/.exec(printed.stdout)?.[1] ?? "null");
  assert.deepEqual(validate(record), [], printed.stdout);
  assert.equal(record.kind, "check");
  assert.equal(record.pr, 40);
  assert.equal(record.sha, SHA);
  assert.equal(record.state, "success");
  assert.equal(record.failed_step, null);
  assert.deepEqual(record.commands.map((c) => c.name), ["node scripts/sync-skills.mjs --check", "cd cli && npm run bundle && npm test"]);
  assert.ok(parseLine(printed.stdout), "the printed line parses as a record");

  const before = run(dir, ["has-records", "--pr", "40", "--sha", SHA]);
  assert.equal(before.status, 1, "no check record before the harvest");
  assert.match(before.stderr, /no check record/);

  const body = `Checks: pass @ ${SHA}\nFence: bubblewrap\n- node scripts/sync-skills.mjs --check: pass\n\n${printed.stdout}`;
  const harvest = run(dir, ["harvest", "--pr", "40", "--repo", "acme/app"], { "repos/acme/app/issues/40/comments": [{ id: 7, user: { login: ME }, body }] });
  assert.equal(harvest.status, 0, harvest.stderr);
  assert.match(harvest.stdout, /-check-40-[0-9a-f]{6}\.json/, "harvest wrote the check record");

  const after = run(dir, ["has-records", "--pr", "40", "--sha", SHA]);
  assert.equal(after.status, 0, after.stderr);
  assert.match(after.stdout, /job, check and review records found/);
});

test("#417: a failed self-run gives a failure record that names the red command", unixOnly, () => {
  const red = withFakes(printedCommand())
    .replace("state=success", "state=failure")
    .replace(/failed_step=null/, "failed_step=npm test");
  const printed = runPrinted(checkout([]), red);
  assert.equal(printed.status, 0, printed.stderr);
  const record = parseLine(printed.stdout);
  assert.ok(record, printed.stdout);
  assert.equal(record.state, "failure");
  assert.equal(record.failed_step, "npm test");
});
