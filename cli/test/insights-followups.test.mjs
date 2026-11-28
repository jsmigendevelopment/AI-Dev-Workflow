// Run-cost record follow-ups (#424, from the review of #420): a send-back needs an outcome, a text field may hold a
// line separator, and the skills quote a usage_from with spaces and name every send-back reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { parseLine, toLine, validate } from "../src/insights-record.mjs";
import { recordProblem } from "../../.agents/skills/coordinate/scripts/insights-land.mjs";
import { JOB, ME, SHA, record, records, run as runWriter, setup } from "./insights-land-fakes.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const WRITER = join(REPO, ".agents/skills/coordinate/scripts/insights.mjs");
const read = (path) => readFileSync(join(REPO, ".agents/skills", path), "utf8");
const SPACED = "get_session: no usage percentage";
const SEPARATORS = [" ", " "];
const FAKE = {
  n: "40", issue: "12", pr: "40", sha: SHA, model: "opus", effort: "low", tool: "codex",
  "usage-before": "unknown", "usage-after": "unknown", "usage-from": `"${SPACED}"`, started: "2026-11-27T14:20:00Z",
};

function repo() {
  const dir = tmp("insights-followups-");
  const r = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
  writeFileSync(join(dir, "README.md"), "x\n");
  return dir;
}

/** Splits a command's arguments the way a shell does for the one thing the skills use: double quotes around a value. */
const words = (text) => [...text.matchAll(/(?:[^\s"]|"[^"]*")+/g)].map((m) => m[0].replace(/"([^"]*)"/g, "$1"));

function writer(dir, args) {
  const env = safeEnv({ ONRAILS_NOW: "2026-11-27T14:32:00Z" });
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [WRITER, ...args], { cwd: dir, encoding: "utf8", env });
}

/** The backticked insights.mjs commands in a skill file that `keep` picks, with <name> filled in. */
function commands(text, keep) {
  const fill = (cmd) => cmd.replace(/<([^>]+)>/g, (_, p) => (p.includes("|") ? p.split("|")[0] : FAKE[p] ?? assert.fail(`no fake for <${p}>`)));
  return [...text.matchAll(/`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs ([^`]+)`/g)].map((m) => m[1]).filter(keep).map(fill);
}

test("AC-424-1: WHEN a record has send_back and no outcome THEN validate refuses it, whatever its source", () => {
  const job = { v: 1, kind: "job", at: "2026-11-28T01:00:00.000Z", model: "unknown", effort: "unknown", send_back: "infra" };
  for (const extra of [{}, { source: "board" }]) {
    const errors = validate({ ...job, ...extra });
    assert.ok(errors.some((e) => e.startsWith("send_back:")), `${JSON.stringify(extra)}: ${errors}`);
  }
  assert.deepEqual(validate({ ...job, outcome: "stopped" }), []);
});

test("AC-424-2: WHEN a text field holds U+2028 or U+2029 THEN the line round-trips through line and parseLine", () => {
  const dir = repo();
  for (const sep of SEPARATORS) {
    const from = `status${sep}line`;
    const r = writer(dir, ["line", "job", "outcome=finished", "usage_before=41%", "usage_after=44%", `usage_from=${from}`]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(parseLine(r.stdout)?.usage_from, from, JSON.stringify(sep));
  }
});

test("AC-424-2: WHEN a note's text holds a line separator THEN write keeps it in a file the land check accepts", () => {
  const dir = repo();
  for (const sep of SEPARATORS) {
    const text = `before${sep}after`;
    const r = writer(dir, ["write", "note", "kind_of=went-right", "belongs=kit", `text=${text}`]);
    assert.equal(r.status, 0, r.stderr);
    const path = r.stdout.trim();
    assert.equal(JSON.parse(readFileSync(path, "utf8")).text, text);
    assert.equal(recordProblem(`docs/insights/2026-11-27/${path.split("/").pop()}`, readFileSync(path)), null);
  }
});

test("AC-424-2: WHEN a reviewer's comment line holds a line separator THEN harvest writes the record", unixOnly, () => {
  for (const sep of SEPARATORS) {
    const { dir } = setup();
    const job = record("job", { outcome: "pass", usage_before: "unknown", usage_after: "unknown", usage_from: `a${sep}b` });
    assert.deepEqual(validate(job), []);
    const comments = [{ id: 3, user: { login: ME }, body: `Verdict\n${toLine(job)}\nRun: x\n` }];
    const r = runWriter(dir, ["harvest", "--pr", "40", "--repo", "acme/app"], { "repos/acme/app/issues/40/comments": comments });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "", "nothing skipped");
    assert.ok(Object.values(records(dir)).some((rec) => rec.usage_from === `a${sep}b`), JSON.stringify(sep));
  }
});

test("AC-424-2: WHEN a comment opens an insights line and never closes it THEN harvest names the comment instead of skipping it", unixOnly, () => {
  const { dir } = setup();
  const comments = [
    { id: 8, user: { login: ME }, body: `Verdict\n<!-- onrails-insights {"v":1,"kind":"job"\n${toLine(JOB)}\n` },
    { id: 9, user: { login: ME }, body: "A comment that never mentions the format.\n" },
  ];
  const r = runWriter(dir, ["harvest", "--pr", "40", "--repo", "acme/app"], { "repos/acme/app/issues/40/comments": comments });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /comment 8 .*never closed/);
  assert.doesNotMatch(r.stderr, /comment 9/);
});

test("AC-424-3: WHEN each skill's job line is run with a usage_from that has spaces, as the skill writes it THEN the writer exits 0 and keeps the words", () => {
  const ends = {
    "pr-review": read("pr-review/SKILL.md"), qa: read("qa/SKILL.md"), "pr-security": read("pr-security/SKILL.md"),
    build: read("build/SKILL.md"),
  };
  for (const [name, text] of Object.entries(ends)) {
    assert.match(text, /`<usage-from>` says where you read it, or where you looked \(quote it if it has spaces\)/, `${name}: says to quote usage_from`);
    const pick = name === "build" ? (c) => c.startsWith("write job ") && c.includes("usage_after=") : (c) => c.startsWith("line job ");
    const [cmd] = commands(text, pick);
    assert.ok(cmd, `${name}: no job command`);
    const r = writer(repo(), words(cmd));
    assert.equal(r.status, 0, `${name}: ${r.stderr}`);
    const rec = r.stdout.startsWith("<!--") ? parseLine(r.stdout) : JSON.parse(readFileSync(r.stdout.trim(), "utf8"));
    assert.equal(rec.usage_from, SPACED, name);
  }
});

test("AC-424-3: WHEN references/insights.md shows a job line with a usage_from that has spaces THEN the value is quoted", () => {
  const example = read("coordinate/references/insights.md").split("\n").find((l) => l.startsWith("insights.mjs line job"));
  assert.match(example, /usage_from="[^"]* [^"]*"/);
});

test("#424: qa's send-back covers the access test and the error and empty states, and pr-security words review-must as pr-review does", () => {
  const qa = read("qa/SKILL.md");
  assert.match(qa, /`send_back=infra` when the preview or the browser wouldn't run, else `send_back=checks`[^.]*access[^.]*error and empty states/);
  const sentence = "On request changes, add `send_back=review-must` to the job line.";
  assert.ok(read("pr-review/SKILL.md").includes(sentence));
  assert.ok(read("pr-security/SKILL.md").includes(sentence));
});

test("#424: local mode's size send-back writes the size-check record with pr=null", () => {
  const [cmd] = commands(read("coordinate/references/local-mode.md"), (c) => c.includes("send_back=size"));
  assert.ok(cmd, "step 3 has a size-check command");
  assert.match(cmd, /\bjob=size-check\b.*\bpr=null\b/);
  const r = writer(repo(), words(cmd));
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(readFileSync(r.stdout.trim(), "utf8"));
  assert.deepEqual([rec.kind, rec.job, rec.pr, rec.outcome, rec.send_back], ["job", "size-check", null, "fail", "size"]);
});
