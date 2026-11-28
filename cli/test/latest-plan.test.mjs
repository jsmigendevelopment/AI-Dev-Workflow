// #448 AC-4: on Full a minor or patch release gets one update pull request, never a second while it's open, and a
// major version stays a suggestion and an FYI. The open pull requests are handed in as a list, so no test needs GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { openUpdatePr, plan } from "../../scripts/latest.mjs";
import { put, tmp } from "./helpers.mjs";
import { SCRIPT, project, registry, run } from "./latest-fakes.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const FULL = "- **Level:** full\n";
const pr = (ref) => ({ number: 1, head: { ref } });
const base = { latest: "0.8.0", kit: "0.7.1", level: "full", onFull: "pr", prs: [] };

test("AC-448-4: WHEN the repo is on Full and a minor or patch release is out THEN the plan is one update pull request", () => {
  assert.deepEqual(plan(base), { action: "pr", version: "0.8.0", bump: "minor", fyi: false });
  assert.equal(plan({ ...base, latest: "0.7.2" }).action, "pr");
  assert.equal(plan({ ...base, latest: "0.7.2" }).bump, "patch");
});

test("AC-448-4: WHEN an update pull request is already open THEN the plan is to wait, never a second one", () => {
  for (const ref of ["chore/12-update-onrails", "chore/9001-update-onrails"]) {
    const out = plan({ ...base, prs: [pr("feat/5-thing"), pr(ref)] });
    assert.equal(out.action, "wait", ref);
    assert.equal(out.pr, ref);
  }
});

test("AC-448-4: the open list reads the REST shape (head.ref) and the gh pr list shape (headRefName)", () => {
  assert.equal(openUpdatePr([{ head: { ref: "chore/3-update-onrails" } }]), "chore/3-update-onrails");
  assert.equal(openUpdatePr([{ headRefName: "chore/3-update-onrails" }]), "chore/3-update-onrails");
  for (const ref of ["chore/update-onrails", "chore/3-update-onrails-2", "feat/3-update-onrails", "chore/3-bump-deps", "x/chore/3-update-onrails"]) {
    assert.equal(openUpdatePr([pr(ref)]), null, ref);
  }
  assert.equal(openUpdatePr([]), null);
});

test("AC-448-4: WHEN the release is a major version THEN it stays a suggestion and an FYI", () => {
  assert.deepEqual(plan({ ...base, latest: "1.0.0" }), { action: "suggest", version: "1.0.0", bump: "major", fyi: true });
  assert.equal(plan({ ...base, latest: "1.0.0", prs: [pr("chore/12-update-onrails")] }).action, "suggest");
});

test("AC-448-4: WHEN the repo is not on Full, or [updates] on_full = suggest THEN it only suggests", () => {
  assert.equal(plan({ ...base, level: "recommended" }).action, "suggest");
  assert.equal(plan({ ...base, level: "hands-on" }).action, "suggest");
  assert.deepEqual(plan({ ...base, onFull: "suggest" }), { action: "suggest", version: "0.8.0", bump: "minor", fyi: false });
});

test("AC-448-4: WHEN nothing newer is out THEN there is nothing to do", () => {
  assert.equal(plan({ ...base, latest: "0.7.1" }).action, "none");
  assert.equal(plan({ ...base, latest: "0.7.0" }).action, "none");
  assert.equal(plan({ ...base, latest: null }).action, "none");
});

/** The plan command on a Full project whose registry has `version`, with the open pull requests in a file. */
async function planWith(prs, { version = "0.8.0", profile } = {}) {
  const reg = await registry({ version });
  try {
    const dir = project({ stack: FULL, profile });
    const home = tmp("onrails-home-");
    if (prs !== undefined) put(dir, "prs.json", JSON.stringify(prs));
    const out = await run(join(dir, SCRIPT), ["plan", "--prs", join(dir, "prs.json")], { dir, home, reg });
    return { ...out, json: out.stdout ? JSON.parse(out.stdout) : null };
  } finally {
    await reg.close();
  }
}

test("AC-448-4: the plan command reads the level from docs/stack.md and the open pull requests from a file", async () => {
  assert.equal((await planWith([])).json.action, "pr");
  assert.equal((await planWith([pr("chore/4-update-onrails")])).json.action, "wait");
  assert.equal((await planWith([], { version: "1.0.0" })).json.action, "suggest");
  assert.equal((await planWith([], { profile: '[updates]\non_full = "suggest"\n' })).json.action, "suggest");
});

test("AC-448-4: WHEN the list of open pull requests can't be read THEN the plan command fails and never says to open one", async () => {
  const out = await planWith(undefined);
  assert.notEqual(out.status, 0);
  assert.ok(!/"action":\s*"pr"/.test(out.stdout), out.stdout);
});

test("AC-448-4: /back and the loop's skills run the plan, name the branch, and keep a major version a suggestion", () => {
  for (const skill of ["back", "coordinate"]) {
    const text = readFileSync(join(REPO, `.agents/skills/${skill}/SKILL.md`), "utf8");
    assert.match(text, /update\/scripts\/latest\.mjs plan/, skill);
    assert.match(text, /chore\/<n>-update-onrails/, skill);
    assert.match(text, /major/i, skill);
  }
});
