// #427, part of #374: `pr-size.mjs ... --record key=value ...` writes the size check's insights record itself, through
// insights.mjs write, so the counted lines on it come from the count and never from an agent's memory. A throwaway
// repo stands in for the coordinator's checkout of main, holding the coordinate scripts (as pr-size.test.mjs does,
// plus the writer), and a fake gh answers for pull request 9 of acme/app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "./child.mjs";
import { fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { validate } from "../src/insights-record.mjs";
import { HEAD, SCRIPTS, checkout, git } from "./pr-rules-fakes.mjs";
import { REPO } from "./insights-land-fakes.mjs";

const NOW = "2026-11-27T14:32:00Z";
const WHO = ["issue=5", "model=opus", "effort=medium", "tool=claude-code"];
const listed = (files) => files.map(([filename, additions, deletions]) => ({ filename, additions, deletions }));

/** Main's checkout, with the writer's scripts next to pr-size.mjs, committed on main. */
function main() {
  const dir = checkout();
  for (const name of ["insights.mjs", "insights-carry.mjs"]) copyFileSync(join(REPO, SCRIPTS, name), join(dir, SCRIPTS, name));
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "the writer");
  return dir;
}

/** pr-size.mjs on pull request 9 with the files ([name, added, removed]) changed, in `dir`. */
function pull({ files = [["src/a.ts", 200, 112]], labels = [], body = "Closes #5", args = ["9", "--repo", "acme/app", "--record", ...WHO], dir = main() } = {}) {
  const api = {
    "repos/acme/app/pulls/9": { number: 9, body, labels: labels.map((name) => ({ name })), changed_files: files.length, base: { ref: "main", sha: git(dir, "rev-parse", "HEAD").trim() }, head: { sha: HEAD } },
    "repos/acme/app/pulls/9/files": listed(files),
  };
  const fake = fakeGh(tmp("onrails-gh-"), api, { ONRAILS_NOW: NOW });
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), ...args], { cwd: dir, encoding: "utf8", env: fake.env });
  return { ...r, dir, records: records(dir) };
}

/** Every record file under dir's docs/insights/, parsed. */
function records(dir) {
  const top = join(dir, "docs", "insights");
  if (!existsSync(top)) return [];
  return readdirSync(top).flatMap((day) => readdirSync(join(top, day)).map((name) => JSON.parse(readFileSync(join(top, day, name), "utf8"))));
}

test("AC-427-1: WHEN the size check passes a pull request head with --record THEN the script writes one size-check record with its counted lines", unixOnly, () => {
  const r = pull();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#9: 312 changed lines counted/);
  assert.equal(r.records.length, 1, "one record");
  const [rec] = r.records;
  assert.deepEqual(validate(rec), []);
  assert.deepEqual([rec.kind, rec.job, rec.outcome, rec.lines, rec.pr, rec.sha, rec.issue], ["job", "size-check", "pass", 312, 9, HEAD, 5]);
  assert.deepEqual([rec.model, rec.effort, rec.tool, rec.at], ["opus", "medium", "claude-code", "2026-11-27T14:32:00.000Z"]);
  assert.equal(rec.send_back, undefined, "a pass sent nothing back");
  assert.match(r.stdout, /Insights: wrote \S+docs\/insights\/2026-11-27\/\d{4}-job-9-[0-9a-f]{6}\.json/);
});

test("AC-427-1: WHEN the head is at the limit or over it THEN the script exits 1 and its one record is the size send-back, with the count", unixOnly, () => {
  const over = pull({ files: [["src/a.ts", 600, 401]] });
  assert.equal(over.status, 1, over.stderr);
  assert.match(over.stderr, /1001 changed lines/);
  assert.equal(over.records.length, 1, "one record, not a pass and a send-back");
  assert.deepEqual(validate(over.records[0]), []);
  assert.deepEqual([over.records[0].outcome, over.records[0].send_back, over.records[0].lines, over.records[0].pr, over.records[0].sha], ["fail", "size", 1001, 9, HEAD]);
  const edge = pull({ files: [["src/a.ts", 500, 500]] });
  assert.equal(edge.status, 1);
  assert.deepEqual([edge.records[0].outcome, edge.records[0].lines], ["fail", 1000]);
  const under = pull({ files: [["src/a.ts", 500, 499]] });
  assert.equal(under.status, 0);
  assert.deepEqual([under.records[0].outcome, under.records[0].lines], ["pass", 999]);
});

test("AC-427-1: WHEN a size exception passes a head of 1,000 lines or more THEN the record is a pass that holds the full count", unixOnly, () => {
  const r = pull({ files: [["src/a.ts", 900, 300]], labels: ["size-exception"], body: "Size exception: a mechanical rename\n\nCloses #5" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([r.records[0].outcome, r.records[0].lines, r.records[0].send_back], ["pass", 1200, undefined]);
});

test("AC-427-1: WHEN lockfiles and fixtures are in the diff THEN the record holds the counted lines, not the changed ones", unixOnly, () => {
  const r = pull({ files: [["src/a.ts", 10, 5], ["pnpm-lock.yaml", 900, 800], ["test/fixtures/big.json", 3000, 0]] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.records[0].lines, 15);
});

/** pr-size.mjs --base main --head <sha> in a repo whose branch commits `files` ({ path: text }) on top of main. */
function local(files, args) {
  const dir = main();
  git(dir, "branch", "-M", "main");
  git(dir, "switch", "-q", "-c", "feat/5-share");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "branch");
  const head = git(dir, "rev-parse", "HEAD").trim();
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), ...args(head)], { cwd: dir, encoding: "utf8", env: safeEnv({ ONRAILS_NOW: NOW }) });
  return { ...r, head, records: records(dir) };
}
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n") + "\n";

test("AC-427-1: WHEN a local diff is checked with --record THEN the record holds the head commit and no pull request", unixOnly, () => {
  const r = local({ "src/a.ts": lines(40) }, (head) => ["--base", "main", "--head", head, "--record", ...WHO]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(validate(r.records[0]), []);
  assert.deepEqual([r.records[0].pr, r.records[0].sha, r.records[0].lines, r.records[0].outcome], [null, r.head, 40, "pass"]);
  const over = local({ "src/a.ts": lines(1200) }, () => ["--base", "main", "--record", ...WHO]);
  assert.equal(over.status, 1, over.stderr);
  assert.deepEqual([over.records[0].sha, over.records[0].lines, over.records[0].outcome, over.records[0].send_back], [over.head, 1200, "fail", "size"]);
});

test("AC-427-1: WHEN --record isn't given THEN the script writes no record, as before", unixOnly, () => {
  const r = pull({ args: ["9", "--repo", "acme/app"] });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.records, []);
  assert.ok(!existsSync(join(r.dir, "docs")), "no docs/insights/ made");
});

test("AC-427-1: WHEN the size can't be counted THEN exit 2 writes no record", unixOnly, () => {
  const r = pull({ args: ["8", "--repo", "acme/app", "--record", ...WHO] });
  assert.equal(r.status, 2);
  assert.deepEqual(r.records, []);
});

test("AC-427-1: WHEN --record is passed a field the script sets, an unknown one or a bare word THEN exit 2, and nothing is counted or written", unixOnly, () => {
  for (const bad of [["lines=5"], ["pr=9"], ["sha=" + "a".repeat(40)], ["outcome=pass"], ["job=build"], ["send_back=size"], ["at=2026-11-27T14:32:00Z"], ["color=red"], ["opus"]]) {
    const r = pull({ args: ["9", "--repo", "acme/app", "--record", ...bad] });
    assert.equal(r.status, 2, bad.join(" "));
    assert.match(r.stderr, /--record/, bad.join(" "));
    assert.equal(r.stdout, "", `${bad.join(" ")}: counted nothing`);
    assert.deepEqual(r.records, []);
  }
  // --record takes key=value pairs to the end, so a flag after it is a usage error too.
  assert.equal(pull({ args: ["9", "--record", ...WHO, "--repo", "acme/app"] }).status, 2);
});

test("AC-427-1: WHEN the record can't be written THEN exit 2 says what was counted and that nothing was recorded", unixOnly, () => {
  const r = pull({ files: [["src/a.ts", 600, 401]], args: ["9", "--repo", "acme/app", "--record", "issue=abc", "model=opus", "effort=medium"] });
  assert.equal(r.status, 2, "an unrecorded count never passes or fails quietly");
  assert.match(r.stdout, /#9: 1001 changed lines counted/);
  assert.match(r.stderr, /Couldn't record the size \(1001 counted lines, over the limit\)[^\n]*issue/);
  assert.deepEqual(r.records, []);
  const lonely = pull({ args: ["9", "--repo", "acme/app", "--record", ...WHO], dir: checkout() });
  assert.equal(lonely.status, 2, "no insights.mjs next to the script");
  assert.match(lonely.stderr, /Couldn't record the size/);
});
