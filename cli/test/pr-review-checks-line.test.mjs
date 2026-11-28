// #545 (follow-up to #441): the pr-review skill says where harvest reads a reviewer's `Checks:` line, and harvest
// names the reason when that line has text after the sha. The comment shapes are copied from the loop's real
// comments; the IDs are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unixOnly } from "./helpers.mjs";
import { toLine } from "../src/insights-record.mjs";
import { JOB, ME, ME_ID, OLD, REVIEW, SHA, pathOf, record, records, run, setup } from "./insights-land-fakes.mjs";

const SKILL = readFileSync(fileURLToPath(new URL("../../.agents/skills/pr-review/SKILL.md", import.meta.url)), "utf8");
const lines = SKILL.split("\n");
const COMMENTS = "repos/acme/app/issues/40/comments";
const COMMANDS = [{ name: "node scripts/sync-skills.mjs --check", result: "pass", seconds: 1 }];
const PASS = record("check", { commands: COMMANDS, failed_step: null, flaky_rerun: false, state: "success", fence: "bubblewrap" });
const harvest = (dir, body) => run(dir, ["harvest", "--pr", "40", "--repo", "acme/app"], { [COMMENTS]: [{ id: 7, user: { login: ME, id: ME_ID }, body }] });
const checks = (dir) => Object.entries(records(dir)).filter(([p]) => p !== pathOf(OLD)).map(([, rec]) => rec).filter((rec) => rec.kind === "check");
const reviewer = (checksLine) => [
  `Code review: approve @ ${SHA}`, "Needs the person: no.", "", `Review: pass @ ${SHA}`, checksLine, "", toLine(JOB), toLine(REVIEW), toLine(PASS),
].join("\n");

/** The skill's "Verdict" section, to the end of the file. */
const verdict = () => SKILL.slice(SKILL.indexOf("\n## Verdict"));

test("AC-545-1: WHEN the skill describes the verdict comment THEN it says the comment starts with `Code review: <verdict> @ <sha>` and has its `Checks:` line at the start of its own line", () => {
  const text = verdict();
  assert.match(text, /starts with `Code review: <verdict> @ <sha>`/);
  assert.match(text, /`Checks: pass\|fail @ <sha>` line[^\n]*at the start of its own line/);
  assert.match(text, /nothing after the sha/);
});

test("AC-545-1: WHEN a merge commit is re-reviewed THEN the skill says that comment has the same shape, with the merge commit's sha", () => {
  const re = lines.find((l) => /re-review/.test(l) && /merge commit/.test(l));
  assert.ok(re, "no line in the skill describes a merge-commit re-review");
  assert.match(re, /starts with `Code review: <verdict> @ <sha>`/);
  assert.match(re, /`Checks:` line at the start of its own line/);
  assert.match(re, /merge commit's sha/);
});

test("AC-545-2: WHEN the skill's `Briefed to run them yourself?` line describes ending the `Checks:` comment THEN it says harvest accepts either a separate `Checks:` comment or the one verdict comment", () => {
  const at = lines.findIndex((l) => l.includes("**Briefed to run them yourself?**"));
  assert.equal(at, 22, "the line stays line 23, where the issue and other docs point to it");
  assert.match(lines[at], /harvest accepts either a separate `Checks:` comment [^\n]*or the one verdict comment/i);
  assert.match(lines[at], /`Checks: pass\|fail @ <sha>`/);
});

test("#545: the skill tells reviewers to pass sha=<full head sha> and pr=<n> to every `line` call and to check the printed sha isn't null", () => {
  const rule = lines.find((l) => /sha=<full head sha>/.test(l) && /pr=<n>/.test(l));
  assert.ok(rule, "no line says to pass sha= and pr= to every `insights.mjs line` call");
  assert.match(rule, /every `insights\.mjs line` call/);
  assert.match(rule, /sha` isn't `null`/);
});

test("AC-545-3: WHEN the first line is `Checks: pass @ <sha>` with text after the sha THEN harvest skips the line and says the line must end at the sha", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, `Checks: pass @ ${SHA} (rerun)\n\n${toLine(PASS)}`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), []);
  assert.match(r.stderr, /skipped a line in comment 7 by loop-bot: .*must end at the sha/);
});

test("AC-545-3: WHEN a reviewer's `Checks:` line has text after the sha THEN harvest skips the line and says the line must end at the sha", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, reviewer(`Checks: pass @ ${SHA} - all green`));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), []);
  assert.match(r.stderr, /skipped a line in comment 7 by loop-bot: .*must end at the sha/);
});

test("AC-545-3: WHEN a reviewer's comment has one clean `Checks:` line and one with text after the sha THEN the clean line still counts", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, reviewer(`Checks: pass @ ${SHA}\nChecks: pass @ ${SHA} (again)`));
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /skipped/);
  assert.deepEqual(checks(dir), [PASS]);
});

test("AC-545-3: WHEN the `Checks:` line ends at the sha, with trailing spaces, THEN harvest keeps it", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, reviewer(`Checks: pass @ ${SHA}  `));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), [PASS]);
});
