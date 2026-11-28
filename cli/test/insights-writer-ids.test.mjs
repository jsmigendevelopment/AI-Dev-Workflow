// #408: harvest trusts a comment's author by numeric user ID, not by login. A renamed login can be taken by someone
// else, so a login that matches gh's own or a writer's but carries another ID is ignored and named. A writer is listed
// as "login:id" under [insights] writers in docs/profile.toml. The IDs here are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unixOnly } from "./helpers.mjs";
import { toLine } from "../src/insights-record.mjs";
import { JOB, ME, ME_ID, OLD, REPO, REVIEW, pathOf, put, records, run, setup } from "./insights-land-fakes.mjs";

const COMMENTS = "repos/acme/app/issues/40/comments";
const from = (id, login, userId, body) => ({ id, user: { login, id: userId }, body });
const harvest = (dir, comments, api = {}) => run(dir, ["harvest", "--pr", "40", "--repo", "acme/app"], { [COMMENTS]: comments, ...api });
const fresh = (dir) => Object.entries(records(dir)).filter(([p]) => p !== pathOf(OLD)).map(([, rec]) => rec);
const writers = (dir, ...entries) => put(dir, "docs/profile.toml", `[insights]\nwriters = [${entries.map((e) => `"${e}"`).join(", ")}]\n`);

test("AC-408-2: WHEN a comment's login matches a writer but its user ID doesn't THEN harvest ignores it and names it", unixOnly, () => {
  const { dir } = setup();
  writers(dir, "review-bot:2002");
  const r = harvest(dir, [from(5, "review-bot", 9999, toLine(REVIEW)), from(6, "review-bot", 2002, toLine(JOB))]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fresh(dir), [JOB], "only the comment with the listed ID");
  assert.match(r.stderr, /comment 5 by review-bot: .*user ID 9999.*2002/, "names the comment, the login and both IDs");
  assert.doesNotMatch(r.stderr, /comment 6/, "the writer's own comment isn't named");
});

test("AC-408-2: WHEN a comment has gh's own login but another user ID THEN harvest ignores it and names it", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, [from(7, ME, 7777, toLine(REVIEW)), from(8, ME, ME_ID, toLine(JOB))]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fresh(dir), [JOB]);
  assert.match(r.stderr, new RegExp(`comment 7 by ${ME}: .*user ID 7777.*${ME_ID}`));
});

test("AC-408-2: a writer who renamed their login is still trusted by the ID, and a stranger with the old login isn't", unixOnly, () => {
  const { dir } = setup();
  writers(dir, "review-bot:2002");
  const r = harvest(dir, [from(5, "review-bot-new", 2002, toLine(REVIEW)), from(6, "review-bot", 5555, toLine(JOB))]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fresh(dir), [REVIEW]);
  assert.match(r.stderr, /comment 6 by review-bot: .*user ID 5555/);
});

test("AC-408-2: a writer listed without an ID is not trusted, and the warning says how to list it; a comment with no user ID isn't either", unixOnly, () => {
  const { dir } = setup();
  writers(dir, "review-bot", "qa-bot:2003");
  const r = harvest(dir, [from(5, "review-bot", 2002, toLine(REVIEW)), { id: 6, user: { login: "qa-bot" }, body: toLine(JOB) }]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fresh(dir), []);
  assert.match(r.stderr, /writers entry "review-bot" has no user ID.*"review-bot:<id>".*gh api users\/review-bot/);
  assert.match(r.stderr, /comment 5 by review-bot: not gh's own account or under \[insights\] writers/);
  assert.match(r.stderr, /comment 6 by qa-bot: .*no user ID/);
});

test("AC-408-2: WHEN gh names no user ID for its own account THEN harvest exits 2 and writes nothing", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, [from(5, ME, ME_ID, toLine(REVIEW))], { user: { login: ME } });
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /no user ID/);
  assert.deepEqual(fresh(dir), []);
});

test("AC-408-2: the docs say a writer is listed as login:id", () => {
  const read = (p) => readFileSync(join(REPO, p), "utf8");
  for (const p of [".agents/skills/coordinate/references/insights.md", ".agents/skills/coordinate/SKILL.md"]) {
    assert.ok(read(p).includes('"<login>:<id>"'), `${p} names the login:id form`);
  }
});
