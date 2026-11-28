// Stricter insights records (#411): `at` is its own ISO UTC form, numbers stay in the safe range, a check's commands
// items are closed, and land reads the size line the way #377's size rule does. The shared set-up is in
// insights-land-fakes.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { unixOnly } from "./helpers.mjs";
import { TEXT_CAP, validate } from "../src/insights-record.mjs";
import { exceptionReason } from "../../.agents/skills/coordinate/scripts/pr-size.mjs";
import { JOB, REPO, REVIEW, SIZE_LINE, branch, json, pathOf, pullOf, record, run, setup, twoNew } from "./insights-land-fakes.mjs";

const AT = "2026-11-27T14:10:00.000Z";
const CHECK = record("check", { commands: [{ name: "npm test", result: "pass", seconds: 95.5 }] });
const TOUCH = record("touch", { what: "yes", minutes: 1.5 });
const problems = (r) => validate(r).join("; ");

test("AC-411-1: WHEN a record's at isn't exactly its own ISO UTC form THEN validate refuses it", () => {
  assert.deepEqual(validate({ ...JOB, at: AT }), [], "the writer's own form passes");
  for (const at of [
    `Nov 27 2026 14:10:00 (${"x".repeat(5000)}) Z`,
    "Thu Nov 27 2026 14:10:00 GMT+0500 Z",
    "2026-11-27T14:10:00Z",
    "2026-11-27 14:10:00.000Z",
    "2026-11-27T14:10:00.000+00:00",
    "2026-11-27T14:10:00.0000Z",
  ]) {
    assert.match(problems({ ...JOB, at }), /^at: /, `${at.slice(0, 40)}: refused`);
  }
});

test("AC-411-2: WHEN a number field isn't a safe integer THEN validate refuses it", () => {
  for (const [field, value] of [["pr", 1e21], ["issue", 2 ** 53], ["pr", Number.MAX_SAFE_INTEGER + 2]]) {
    assert.match(problems({ ...JOB, [field]: value }), new RegExp(`^${field}: `), `${field}: ${value}`);
  }
  for (const field of ["round", "must", "nice"]) assert.match(problems({ ...REVIEW, [field]: 1e21 }), new RegExp(`^${field}: `));
  assert.deepEqual(validate({ ...JOB, pr: Number.MAX_SAFE_INTEGER }), [], "the largest safe integer passes");
  // A num field keeps its fractions (a check's 95.5 seconds), but stays in the same safe range.
  assert.deepEqual(validate(TOUCH), []);
  assert.match(problems({ ...TOUCH, minutes: 1e21 }), /^minutes: /);
});

test("AC-411-2: WHEN a commands item has an extra key or a name over 200 characters THEN validate refuses it", () => {
  const item = CHECK.commands[0];
  const withItem = (more) => ({ ...CHECK, commands: [item, { ...item, ...more }] });
  assert.deepEqual(validate(CHECK), []);
  assert.deepEqual(validate(withItem({ name: "n".repeat(TEXT_CAP) })), [], `a name of ${TEXT_CAP} characters passes`);
  assert.match(problems(withItem({ name: "n".repeat(TEXT_CAP + 1) })), /^commands: /, "a name over the cap");
  assert.match(problems(withItem({ name: "n".repeat(8000) })), /^commands: /, "an 8,000-character name");
  assert.match(problems(withItem({ extra: { deep: [1, 2] } })), /^commands: /, "an extra key");
  assert.match(problems({ ...CHECK, commands: [JSON.parse(`{"name":"x","result":"pass","seconds":1,"__proto__":{}}`)] }), /^commands: /, "an own __proto__ key");
  assert.match(problems(withItem({ seconds: 1e21 })), /^commands: /, "seconds past the safe range");
});

test("AC-411-1, AC-411-2: land --verify refuses each shape, and passes every record on main in its own bytes", unixOnly, () => {
  const { dir, seed } = setup();
  const shapes = [
    { ...JOB, at: `Nov 27 2026 14:10:00 (${"x".repeat(5000)}) Z` },
    { ...JOB, pr: 1e21 },
    { ...CHECK, commands: [{ ...CHECK.commands[0], name: "n".repeat(8000), extra: { deep: [1] } }] },
  ];
  shapes.forEach((r, i) => {
    const ref = `chore/insights-2026-11-27-150${i}`;
    const path = pathOf(r, `bbbbb${i}`);
    const sha = branch(seed, ref, { [path]: json(r) });
    const got = run(dir, ["land", "--verify", String(80 + i), "--repo", "acme/app"], { [`repos/acme/app/pulls/${80 + i}`]: pullOf(80 + i, ref, sha) });
    assert.equal(got.status, 1, `${path}: ${got.stderr}`);
    assert.ok(got.stderr.includes(path), `names ${path}: ${got.stderr}`);
  });
  // The format is shared: every record the kit's own main holds still passes, byte for byte.
  const top = join(REPO, "docs/insights");
  const real = readdirSync(top).flatMap((day) => readdirSync(join(top, day)).map((name) => join(top, day, name)));
  assert.ok(real.length > 0);
  for (const file of real) {
    const text = readFileSync(file, "utf8");
    assert.deepEqual(validate(JSON.parse(text)), [], file);
    assert.equal(json(JSON.parse(text)), text, `${file} is in the writer's bytes`);
  }
});

/** Runs land with one open records pull request #66 that already has both labels and `body`; returns the new body. */
function landWithBody(body) {
  const { dir, seed } = setup();
  const [first] = twoNew(dir);
  const ref = "chore/insights-2026-11-27-1200";
  const sha = branch(seed, ref, { [first]: readFileSync(join(dir, first), "utf8") });
  const pull = pullOf(66, ref, sha, { labels: ["no-issue", "size-exception"], body });
  const r = run(dir, ["land", "--repo", "acme/app"], {
    "repos/acme/app/pulls?state=open&per_page=100": [pull], "repos/acme/app/pulls/66": { number: 66 },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "66\n");
  return /-X PATCH -f body=([^]*) repos\/acme\/app\/pulls\/66\n/.exec(r.calls)?.[1];
}

test("AC-411-3: WHEN a reused records PR's only Size exception: line is inside an HTML comment THEN land adds a real one", unixOnly, () => {
  const patched = landWithBody(`Records only.\n\n<!-- ${SIZE_LINE} -->\n`);
  assert.ok(patched !== undefined, "land patches the body");
  assert.equal(exceptionReason(patched), "insights records only, each checked by land --verify", "#377's size rule reads the new line");
  assert.ok(patched.includes(`<!-- ${SIZE_LINE} -->`), "the old body stays");
});

test("AC-411-3: a line only in a code block or after an unclosed comment gets a real one; a visible line gets no write", unixOnly, () => {
  for (const body of [`Records.\n\n\`\`\`\n${SIZE_LINE}\n\`\`\`\n`, `Records.\n\n    ${SIZE_LINE}\n`, `Records.\n\n<!-- a note\n\n${SIZE_LINE}\n`]) {
    const patched = landWithBody(body);
    assert.ok(patched !== undefined, `patches ${JSON.stringify(body)}`);
    assert.equal(exceptionReason(patched), "insights records only, each checked by land --verify", JSON.stringify(body));
  }
  assert.equal(landWithBody(`Records.\n\n${SIZE_LINE}\n`), undefined, "a visible line: no PATCH");
});
