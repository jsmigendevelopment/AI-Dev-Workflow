// The privacy eval for kit lessons (#253 AC-2, #322): a made-up project full of planted details, a table of candidate
// lessons that each carry one of them, and clean lessons. Nothing planted may get through `lesson check --project`.
// Local only: a temp git repo, a temp home folder and the CLI in a child process. No model, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { checkLesson } from "../src/lesson-check.mjs";
import { PLANTED, check, fixture, good, manifest } from "./lesson-fixture.mjs";

// One row per planted detail. `deny` marks a row the allowlist from #321 alone would pass, so only the deny set
// refuses it.
const ROWS = [
  { detail: "appName", deny: true, record: good({ lesson: "The builder broke the garden check before the merge." }) },
  { detail: "owner", deny: true, record: good({ suggested_fix: "Push to north-river before the review." }) },
  { detail: "person", deny: true, record: good({ lesson: "The builder waited on Faith Bridge for the review." }) },
  { detail: "email", record: good({ lesson: `The builder wrote to ${PLANTED.email} on the branch.` }) },
  { detail: "emailDomain", deny: true, record: good({ lesson: "The builder waited on the bright-paper review." }) },
  { detail: "codeDomain", deny: true, record: good({ suggested_fix: "Check the green-market server before the merge." }) },
  { detail: "filePath", record: good({ lesson: `The builder broke ${PLANTED.filePath} on the branch.` }) },
  { detail: "envName", record: good({ lesson: `The builder lost ${PLANTED.envName} on the branch.` }) },
  { detail: "issueNumber", record: good({ lesson: `The builder reopened ${PLANTED.issueNumber} on the branch.` }) },
  { detail: "codeLine", record: good({ suggested_fix: `Keep ${PLANTED.codeLine} on the branch.` }) },
  { detail: "decisionName", deny: true, record: good({ lesson: "The builder asked grant before the merge." }) },
  // A name in another form: its camelCase parts spaced or hyphenated, or its singular or plural. `carries` is the form.
  { detail: "pascalName", form: "spaced", carries: "stone party", deny: true,
    record: good({ lesson: "The builder broke the stone party check before the merge." }) },
  { detail: "pascalName", form: "hyphenated", carries: "stone-party", deny: true,
    record: good({ suggested_fix: "Run the stone-party check before the merge." }) },
  { detail: "pluralApp", form: "singular", carries: "note", deny: true,
    record: good({ lesson: "The builder broke the note check before the merge." }) },
  { detail: "decisionName", form: "plural", carries: "grants", deny: true,
    record: good({ lesson: "The builder asked grants before the merge." }) },
  { detail: "docsWord", form: "singular", carries: "order", deny: true,
    record: good({ lesson: "The builder lost an order before the merge." }) },
];

const CLEAN = [
  good(),
  good({ lesson: "Two builders changed the same file and the merge failed." }),
  good({ lesson: "The coordinator ran the flaky test three times before it passed.", category: "flaky-test" }),
  good({ suggested_fix: "Ask the person once and then wait for the answer." }),
];

const results = [];

for (const row of ROWS) {
  const form = row.form ? ` (${row.form})` : "";
  test(`AC-322-1: WHEN a lesson carries the planted ${row.detail}${form} THEN lesson check --project refuses it`, () => {
    assert.match(JSON.stringify(row.record), new RegExp(escape(row.carries ?? PLANTED[row.detail]), "i"), "the row carries its detail");
    if (row.deny) assert.equal(checkLesson(row.record, { manifest }).ok, true, "the allowlist alone passes it");
    const r = check(row.record);
    results.push(r);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    if (row.deny) assert.match(r.stderr, /: contains a project term \(/);
  });
}

test("AC-322-2: WHEN a record is refused THEN it is not altered on disk, and nothing is cleaned up and accepted", () => {
  const r = check(ROWS[0].record);
  assert.equal(r.status, 1);
  assert.equal(readFileSync(r.file, "utf8"), r.text);
  assert.deepEqual(readdirSync(r.folder), ["lesson.json"]);
  assert.doesNotMatch(r.stdout + r.stderr, /accepted/i);
});

test("AC-322-3: WHEN the planted app name is a common English word THEN the deny set still refuses it", () => {
  const record = good({ lesson: "The builder broke the garden check before the merge." });
  assert.equal(checkLesson(record, { manifest }).ok, true, "the allowlist alone passes it");
  const r = check(record);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^ {2}lesson: contains a project term \((git remote|package name|docs)\)$/m);
});

test("AC-322-4: WHEN every lesson lesson check accepts is scanned for every planted detail THEN none is found", () => {
  for (const record of CLEAN) results.push(check(record));
  const accepted = results.filter((r) => r.status === 0);
  assert.equal(accepted.length, CLEAN.length, "every clean lesson is accepted");
  for (const r of accepted) {
    for (const [name, value] of Object.entries(PLANTED)) {
      assert.doesNotMatch(r.text, new RegExp(escape(value), "i"), `${name} got through`);
      // Each part, camelCase parts too, in either number.
      const parts = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
      for (const word of parts) {
        const stem = word.replace(/([^s])s$/, "$1");
        assert.doesNotMatch(r.text, new RegExp(`\\b(${word}|${stem})(e?s)?\\b`, "i"), `part of ${name} got through`);
      }
    }
  }
});

test("AC-322-6: WHEN the repo is named after a kit word such as review THEN a lesson that uses review is accepted", () => {
  const dir = fixture({ repoName: "review", packageName: "review" });
  const r = check(good({ lesson: "The builder waited on the review before the merge." }), dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(check(good({ lesson: "The builder broke the garden check." }), dir).status, 1);
});

test("AC-322-6: WHEN the repo is named review THEN its plural reviews is accepted too", () => {
  const dir = fixture({ repoName: "review", packageName: "review" });
  const r = check(good({ lesson: "The builder waited on two reviews before the merge." }), dir);
  assert.equal(r.status, 0, r.stderr);
});

test("lesson check: an app named after a kit file name (board, vision-flow) is still refused, and a skill name leaves the set", () => {
  const board = fixture({ repoName: "Board", packageName: "vision-flow" });
  for (const lesson of ["The builder broke the board check.", "The builder broke the vision flow check."]) {
    const r = check(good({ lesson }), board);
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \((git remote|package name)\)$/m);
  }
  // The component field holds a name from the kit's own closed list, so it carries nothing from the project.
  assert.equal(check(good({ component: "board" }), board).status, 0);
  const grill = fixture({ repoName: "grill", packageName: "grill" });
  const r = check(good({ lesson: "The builder ran grill before the merge." }), grill);
  assert.equal(r.status, 0, r.stderr);
});

test("AC-322-7: WHEN a record is refused for a project term THEN the output names the field and the source kind, never the term", () => {
  const r = check(good({ suggested_fix: "Check the green-market server before the merge." }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^ {2}suggested_fix: contains a project term \(domain\)$/m);
  assert.doesNotMatch(r.stdout + r.stderr, /green|market/i);
  const name = check(good({ lesson: "The builder waited on Faith Bridge for the review." }));
  assert.match(name.stderr, /^ {2}lesson: contains a project term \(profile\)$/m);
  assert.doesNotMatch(name.stdout + name.stderr, /faith|bridge/i);
});

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}