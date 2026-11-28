// #490: `insights.mjs carry` proves the merge in the checkout its script sits in (the coordinator's checkout of main),
// not in the folder it is started from or the one CLAUDE_PROJECT_DIR or GIT_DIR names. A pull request clone's own
// .gitattributes must never decide whether main's merge is clean. The git set-up is insights-carry-fakes.mjs; this
// file starts the script by hand because the shared runner always starts it inside the checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { fakeGh, tmp, unixOnly } from "./helpers.mjs";
import { CLASH, at, mergeMain, reviewed, state } from "./insights-carry-fakes.mjs";
import { ME, SCRIPTS, records } from "./insights-land-fakes.mjs";

/** carry from main's checkout (fx.dir)'s script, started in `cwd` with `env` added, against a fake gh. */
function carryFrom(fx, to, cwd, env = {}) {
  const gh = fakeGh(tmp("onrails-gh-"), { user: { login: ME } }, { ONRAILS_NOW: "2026-11-27T14:32:00Z", ...env });
  const args = ["carry", "--pr", "40", "--from", fx.from, "--to", to];
  return spawnSync(process.execPath, [join(fx.dir, SCRIPTS, "insights.mjs"), ...args], { cwd, encoding: "utf8", env: gh.env });
}

// A branch rule that joins both sides of README.md: the merge is clean only under the branch's own rules.
const BRANCH_UNION = { ...CLASH, feature: { "README.md": "feature\n", ".gitattributes": "*.md merge=union\n" } };

test("AC-490-1: WHEN carry is started in a pull request clone whose .gitattributes adds a union merge for the changed file, and the merge conflicts under main's attributes THEN carry refuses", unixOnly, () => {
  const fx = reviewed(BRANCH_UNION);
  const to = mergeMain(fx);
  const was = state(fx.dir);
  const before = Object.keys(records(fx.dir)).length;
  const r = carryFrom(fx, to, fx.seed);
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /conflicts/, r.stderr);
  assert.equal(Object.keys(records(fx.dir)).length, before, "writes nothing");
  assert.equal(state(fx.dir), was, "main's checkout is as it was");
});

test("AC-490-2: WHEN CLAUDE_PROJECT_DIR or GIT_DIR points at another checkout THEN carry still proves the merge in the checkout the script sits in", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  const elsewhere = { CLAUDE_PROJECT_DIR: fx.seed, GIT_DIR: join(fx.seed, ".git") };
  const cases = { CLAUDE_PROJECT_DIR: { CLAUDE_PROJECT_DIR: elsewhere.CLAUDE_PROJECT_DIR }, GIT_DIR: { GIT_DIR: elsewhere.GIT_DIR }, both: elsewhere };
  for (const [name, env] of Object.entries(cases)) {
    const r = carryFrom(fx, to, fx.seed, env);
    assert.equal(r.status, 0, `${name}: ${r.stdout}${r.stderr}`);
    assert.deepEqual(at(fx.dir, to).map((m) => m.kind).sort(), ["job", "review"], `${name}: the records are in the script's checkout`);
    assert.deepEqual(at(fx.seed, to), [], `${name}: nothing is written in the other checkout`);
  }
});

test("AC-490-2: a conflicting merge is still refused when CLAUDE_PROJECT_DIR and GIT_DIR name the branch's clone", unixOnly, () => {
  const fx = reviewed(BRANCH_UNION);
  const to = mergeMain(fx);
  const r = carryFrom(fx, to, fx.seed, { CLAUDE_PROJECT_DIR: fx.seed, GIT_DIR: join(fx.seed, ".git") });
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /conflicts/, r.stderr);
});
