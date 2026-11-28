// #408: the merge gate (pr-rules.mjs) checks every file a pull request changes under docs/insights/ with the same
// record check `land --verify` uses, so a normal pull request can't slip a file in there. A fake gh answers the pull
// request and each file's content at the head; main's checkout holds the real .gitattributes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { safeEnv, unixOnly } from "./helpers.mjs";
import { HEAD, rules } from "./pr-rules-fakes.mjs";
import { OLD, REPO, json, pathOf } from "./insights-land-fakes.mjs";
import { recordProblem } from "../../.agents/skills/coordinate/scripts/insights-land.mjs";

const GOOD = pathOf(OLD);
const NOTES = "docs/insights/2026-11-27/notes.txt";
const answer = (text, extra = {}) => ({ type: "file", size: Buffer.byteLength(text), encoding: "base64", content: Buffer.from(text).toString("base64"), ...extra });
/** The fake gh's answer for one file's content at the head. */
const content = (path, text, extra) => ({ [`repos/acme/app/contents/${path}?ref=${HEAD}`]: answer(text, extra) });
const attributes = readFileSync(join(REPO, ".gitattributes"), "utf8");

test("AC-408-1: WHEN a normal pull request adds a non-record file under docs/insights/ THEN the gate fails and names it", unixOnly, () => {
  const r = rules({ files: [["src/a.ts", 10, 5], [NOTES, 1, 0]], api: content(NOTES, "scratch\n") });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, new RegExp(`${NOTES}: not a record file`));
});

test("AC-408-1: WHEN a normal pull request adds a record the writer wrote THEN the gate passes it", unixOnly, () => {
  const r = rules({ files: [["src/a.ts", 10, 5], [GOOD, 14, 0]], api: content(GOOD, json(OLD)), attributes });
  assert.equal(r.status, 0, r.stderr);
});

test("AC-408-1: a record that isn't the writer's exact bytes, or sits under another name, is named; the good file beside it is not", unixOnly, () => {
  const loose = pathOf(OLD, "b2c3d4");
  const spaced = JSON.stringify(OLD);
  const renamed = "docs/insights/2026-11-27/0000-job-12-a1b2c3.json";
  const files = [[GOOD, 14, 0], [loose, 1, 0], [renamed, 14, 0]];
  const api = { ...content(GOOD, json(OLD)), ...content(loose, spaced), ...content(renamed, json(OLD)) };
  const r = rules({ files, api });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, new RegExp(`${loose}: not in the writer's exact bytes`));
  assert.match(r.stderr, new RegExp(`${renamed}: its name doesn't match the record`));
  assert.ok(!r.stderr.includes(`${GOOD}:`), "the good record isn't named");
});

test("AC-408-1: a file over the size cap is named without being read, and a path that isn't a plain file is named", unixOnly, () => {
  const big = "docs/insights/2026-11-27/big.json";
  const link = "docs/insights/2026-11-27/link.json";
  const r = rules({ files: [[big, 5, 0], [link, 1, 0]], api: { ...content(big, "", { size: 20000, encoding: "none", content: "" }), ...content(link, "x", { type: "symlink" }) } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, new RegExp(`${big}: over 16384 bytes`));
  assert.match(r.stderr, new RegExp(`${link}: not a plain file`));
});

test("AC-408-1: a file renamed into docs/insights/ is checked at its new name, and a file removed from it is not read", unixOnly, () => {
  const r = rules({ files: [[NOTES, 0, 0, "src/old.txt"], ["docs/insights/2026-11-27/gone.json", 0, 3, undefined, "removed"]], api: content(NOTES, "scratch\n") });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, new RegExp(NOTES));
  assert.ok(!r.stderr.includes("gone.json"), "a removed file has nothing to check");
  assert.ok(!r.calls.includes("gone.json"), "and isn't read");
});

test("AC-408-1: a pull request with no file under docs/insights/ reads none, and one the API can't read is never a pass", unixOnly, () => {
  const plain = rules({ files: [["src/a.ts", 10, 5]] });
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(!plain.calls.includes("/contents/"), "no content read");
  const unread = rules({ files: [[GOOD, 14, 0]] });
  assert.equal(unread.status, 2, unread.stdout);
  assert.match(unread.stderr, new RegExp(GOOD));
});

test("AC-408-1: the gate's check is land --verify's own: every record on main passes it", () => {
  const top = join(REPO, "docs/insights");
  const bad = [];
  for (const day of readdirSync(top)) {
    for (const name of readdirSync(join(top, day))) {
      const problem = recordProblem(`docs/insights/${day}/${name}`, readFileSync(join(top, day, name)));
      if (problem) bad.push(`${day}/${name}: ${problem}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("AC-408-1: the kit marks only record files under docs/insights/ generated, so any other file there counts toward the size", () => {
  assert.match(attributes, /^docs\/insights\/\*\/\*\.json linguist-generated$/m);
  assert.doesNotMatch(attributes, /^docs\/insights\/\*\* /m);
  const check = (path) => spawnSync("git", ["check-attr", "linguist-generated", "--", path], { cwd: REPO, encoding: "utf8", env: safeEnv() }).stdout;
  assert.match(check(GOOD), /linguist-generated: set$/m);
  assert.doesNotMatch(check(NOTES), /linguist-generated: set$/m);
});
