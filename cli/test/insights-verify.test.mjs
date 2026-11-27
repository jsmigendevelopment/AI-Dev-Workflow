// `insights.mjs land --verify <pr>` (#332, AC-332-4): the whole review of a records-only pull request (decision 332-1),
// so every refusal is pinned here. The shared set-up is in insights-land-fakes.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { unixOnly } from "./helpers.mjs";
import { JOB, OLD, REVIEW, branch, git, json, pathOf, pullOf, put, record, run, setup } from "./insights-land-fakes.mjs";

const verify = (dir, n, pull) => run(dir, ["land", "--verify", String(n), "--repo", "acme/app"], { [`repos/acme/app/pulls/${n}`]: pull });
const GOOD = { [pathOf(REVIEW)]: json(REVIEW), [pathOf(JOB)]: json(JOB) };
const LATER = { ...REVIEW, at: "2026-11-27T15:00:00.000Z" };
const CAP = 16384;

/** Runs --verify on a new branch per case: `files` to add, or `change(seed)` to make in the seed clone. */
function refuses(cases) {
  const { dir, seed } = setup();
  cases.forEach(({ why, files, change, names }, i) => {
    const ref = `chore/insights-2026-11-27-15${String(i).padStart(2, "0")}`;
    const sha = branch(seed, ref, files ?? {}, "origin/main", change);
    const r = verify(dir, 100 + i, pullOf(100 + i, ref, sha));
    assert.equal(r.status, 1, `${why}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stderr.includes(names), `${why}: names ${names} in ${r.stderr}`);
  });
}

test("AC-332-4: WHEN land --verify sees a changed file outside docs/insights/, a changed (not added) record, or an invalid record THEN it exits 1 and names the file", unixOnly, () => {
  const { dir, seed } = setup();
  const okSha = branch(seed, "chore/insights-2026-11-27-1400", GOOD);
  const ok = verify(dir, 90, pullOf(90, "chore/insights-2026-11-27-1400", okSha));
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(okSha), "prints the head it checked");

  const badRecord = pathOf(LATER, "eeeeee");
  refuses([
    { why: "a file outside docs/insights/", files: { ...GOOD, "README.md": "changed\n" }, names: "README.md" },
    { why: "a changed record", files: { [pathOf(OLD)]: json({ ...OLD, outcome: "failed" }) }, names: pathOf(OLD) },
    { why: "an invalid record", files: { [badRecord]: json({ ...LATER, verdict: "maybe" }) }, names: badRecord },
    { why: "a record whose name doesn't match it", files: { "docs/insights/2026-11-27/0000-job-1-abcdef.json": json(JOB) }, names: "0000-job-1-abcdef.json" },
  ]);
});

test("AC-332-4: --verify refuses a rename, a mode change, an executable record and a symlink", unixOnly, () => {
  const link = (s) => {
    mkdirSync(dirname(join(s, pathOf(JOB))), { recursive: true });
    symlinkSync("../../../README.md", join(s, pathOf(JOB)));
  };
  refuses([
    { why: "a renamed record", change: (s) => git(s, "mv", pathOf(OLD), pathOf(OLD, "999999")), names: pathOf(OLD) },
    { why: "a mode change", change: (s) => chmodSync(join(s, pathOf(OLD)), 0o755), names: pathOf(OLD) },
    { why: "an added executable record", change: (s) => { put(s, pathOf(JOB), json(JOB)); chmodSync(join(s, pathOf(JOB)), 0o755); }, names: pathOf(JOB) },
    { why: "a symlink", change: link, names: pathOf(JOB) },
  ]);
});

test("AC-332-4: --verify refuses a record of a kind named after an object method, and any file not in the writer's exact bytes", unixOnly, () => {
  const method = record("constructor", { name: "x".repeat(150) });
  const methodPath = "docs/insights/2026-11-27/1410-constructor-40-abcdef.json";
  const dupe = `{\n  "verdict": "${"<b>".repeat(300)}",${json(LATER).slice(1)}`;
  const big = (n) => ({ ...LATER, categories: Array.from({ length: n }, (_, i) => `c${i}`.padEnd(100, "x")) });
  refuses([
    { why: "kind constructor", files: { [methodPath]: json(method) }, names: methodPath },
    { why: "a duplicate key", files: { [pathOf(LATER, "111111")]: dupe }, names: pathOf(LATER, "111111") },
    { why: "compact JSON", files: { [pathOf(LATER, "222222")]: `${JSON.stringify(LATER)}\n` }, names: pathOf(LATER, "222222") },
    { why: "no final newline", files: { [pathOf(LATER, "333333")]: JSON.stringify(LATER, null, 2) }, names: pathOf(LATER, "333333") },
    { why: `over ${CAP} bytes`, files: { [pathOf(LATER, "444444")]: json(big(200)) }, names: pathOf(LATER, "444444") },
    { why: "over 1 MB", files: { [pathOf(LATER, "555555")]: json(big(12000)) }, names: pathOf(LATER, "555555") },
  ]);
});

test("AC-332-4: --verify refuses a record whose kind is a list, and a raw byte that isn't UTF-8", unixOnly, () => {
  // Each would pass as its kind's text: the review's fields, the job's, and a check with commands of any shape.
  const kinds = [
    { ...LATER, kind: ["review"] },
    { ...record("job", { outcome: "pass" }), at: LATER.at, kind: [["job"]] },
    { ...record("check", { commands: [1, null, { x: "y" }] }), at: LATER.at, kind: ["check"] },
  ].map((r, i) => ({ why: `kind ${JSON.stringify(r.kind)}`, files: { [pathOf(r, `66666${i}`)]: json(r) }, names: pathOf(r, `66666${i}`) }));
  // The writer's text holds U+FFFD where the file holds a raw 0xFF byte: equal as decoded text, not as bytes.
  const odd = { ...LATER, model: "a�b" };
  const [before, after] = json(odd).split("�");
  const raw = Buffer.concat([Buffer.from(before), Buffer.from([0xff]), Buffer.from(after)]);
  refuses([...kinds, { why: "a raw 0xFF byte", files: { [pathOf(odd, "777777")]: raw }, names: pathOf(odd, "777777") }]);
});

test("#332: --verify compares the repos by id, not by name, and refuses a fork or a deleted fork", unixOnly, () => {
  const { dir, seed } = setup();
  const ref = "chore/insights-2026-11-27-1600";
  const sha = branch(seed, ref, { [pathOf(REVIEW)]: json(REVIEW) });
  const renamed = verify(dir, 94, pullOf(94, ref, sha, { headName: "Acme/App" }));
  assert.equal(renamed.status, 0, `the same repo under another case: ${renamed.stderr}`);
  for (const [n, opts] of [[95, { headId: 2 }], [96, { headId: null }]]) {
    const r = verify(dir, n, pullOf(n, ref, sha, opts));
    assert.equal(r.status, 1, `${JSON.stringify(opts)}: ${r.stderr}`);
  }
});

test("#332: land --verify refuses a pull request the coordinator didn't open, or one whose head moved", unixOnly, () => {
  const { dir, seed } = setup();
  const ref = "chore/insights-2026-11-27-1600";
  const sha = branch(seed, ref, { [pathOf(REVIEW)]: json(REVIEW) });
  const other = verify(dir, 95, pullOf(95, ref, sha, { login: "someone-else" }));
  assert.equal(other.status, 1, other.stderr);
  assert.match(other.stderr, /someone-else/);
  const notChore = verify(dir, 96, pullOf(96, "feat/12-x", sha));
  assert.equal(notChore.status, 1, notChore.stderr);
  const moved = verify(dir, 97, pullOf(97, ref, "d".repeat(40)));
  assert.equal(moved.status, 2, moved.stderr);
});
