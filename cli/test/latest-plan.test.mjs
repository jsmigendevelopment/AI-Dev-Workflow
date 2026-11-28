// #698 (AC-4 of #448): on Full a minor or patch release gets one update pull request, never a second while it's open,
// and a major version stays a suggestion and an FYI. The open pull requests are handed in as a list in a file, so no
// test needs GitHub; the registry is a fake on 127.0.0.1, and no test runs `npx onrails@latest update`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { openUpdateIssue, openUpdatePr, plan, settings } from "../../scripts/latest.mjs";
import { put, tmp } from "./helpers.mjs";
import { SCRIPT, project, registry, run } from "./latest-fakes.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const FULL = "- **Level:** full\n";
const pr = (ref) => ({ number: 1, head: { ref } });
const base = { latest: "0.8.0", kit: "0.7.1", level: "full", onFull: "pr", prs: [], issues: [] };

test("AC-698-1: WHEN the repo is on Full and a minor or patch release is out THEN the plan is one update pull request", () => {
  assert.deepEqual(plan(base), { action: "pr", version: "0.8.0", bump: "minor", fyi: false });
  const patch = plan({ ...base, latest: "0.7.2" });
  assert.deepEqual([patch.action, patch.bump], ["pr", "patch"]);
});

test("AC-698-1: WHEN an update pull request or its issue is open THEN the plan is to wait, never a second one", () => {
  for (const ref of ["chore/12-update-onrails", "chore/9001-update-onrails"]) {
    const out = plan({ ...base, prs: [pr("feat/5-thing"), pr(ref)] });
    assert.deepEqual([out.action, out.pr], ["wait", ref]);
  }
  const byIssue = plan({ ...base, issues: [{ number: 40, title: "Update onRails to 0.8.0" }] });
  assert.deepEqual([byIssue.action, byIssue.issue], ["wait", 40]);
});

test("AC-698-1: the open list reads the REST shape (head.ref), the gh pr list shape (headRefName) and nothing else", () => {
  assert.equal(openUpdatePr([{ head: { ref: "chore/3-update-onrails" } }]), "chore/3-update-onrails");
  assert.equal(openUpdatePr([{ headRefName: "chore/3-update-onrails" }]), "chore/3-update-onrails");
  for (const ref of ["chore/update-onrails", "chore/3-update-onrails-2", "feat/3-update-onrails", "chore/3-bump-deps", "x/chore/3-update-onrails"]) {
    assert.equal(openUpdatePr([pr(ref)]), null, ref);
  }
  assert.equal(openUpdatePr([]), null);
  assert.equal(openUpdateIssue([{ number: 7, title: "Update onRails to 1.2.3" }]), 7);
  for (const title of ["Update onRails", "Update onRails to latest", "Please Update onRails to 1.2.3", "Update onRails to 1.2.3 and more"]) {
    assert.equal(openUpdateIssue([{ number: 7, title }]), null, title);
  }
});

test("AC-698-2: WHEN the release is a major version THEN it stays a suggestion and an FYI, with no pull request", () => {
  assert.deepEqual(plan({ ...base, latest: "1.0.0" }), { action: "suggest", version: "1.0.0", bump: "major", fyi: true });
  assert.equal(plan({ ...base, latest: "1.0.0", prs: [pr("chore/12-update-onrails")] }).action, "suggest");
});

test("AC-698-3: WHEN the repo is below Full, or [updates] on_full = suggest THEN it only suggests", () => {
  assert.equal(plan({ ...base, level: "recommended" }).action, "suggest");
  assert.equal(plan({ ...base, level: "hands-on" }).action, "suggest");
  assert.deepEqual(plan({ ...base, onFull: "suggest" }), { action: "suggest", version: "0.8.0", bump: "minor", fyi: false });
});

test("AC-698-3: [updates] on_full is pr unless the profile says suggest", () => {
  const home = tmp("onrails-home-");
  const withProfile = (profile) => { const dir = tmp("onrails-plan-"); put(dir, "docs/profile.toml", profile); return settings(dir, home); };
  assert.equal(settings(tmp("onrails-plan-"), home).onFull, "pr");
  assert.equal(withProfile('[updates]\non_full = "suggest"\n').onFull, "suggest");
  assert.equal(withProfile('[updates]\non_full = "SUGGEST"\ncheck = "weekly"\n').onFull, "suggest");
  assert.deepEqual(withProfile('[updates]\non_full = "always"\n'), { check: "daily", onFull: "pr" });
});

test("AC-698-3: the profile template carries the on_full switch beside check", () => {
  const text = readFileSync(join(REPO, ".agents/skills/idea/templates/profile.toml"), "utf8");
  assert.match(text, /^check = "daily"[^\n]*\n[^\n]*\bon_full = "pr"\s+# pr \| suggest/m);
});

test("AC-698-1: WHEN nothing newer is out THEN there is nothing to do", () => {
  assert.equal(plan({ ...base, latest: "0.7.1" }).action, "none");
  assert.equal(plan({ ...base, latest: "0.7.0" }).action, "none");
  assert.equal(plan({ ...base, latest: null }).action, "none");
  assert.equal(plan({ ...base, kit: null }).action, "none");
});

/**
 * The plan command on a project whose registry has `version`, with the open pull requests in a file. `prs` is the file's
 * text (undefined: no file at all); an object is written as JSON. `issues` is the same for the optional issues file.
 */
async function planWith(prs, { version = "0.8.0", profile, stack = FULL, issues } = {}) {
  const reg = await registry({ version });
  try {
    const dir = project({ stack, profile });
    const home = tmp("onrails-home-");
    const text = (v) => (typeof v === "string" ? v : JSON.stringify(v));
    if (prs !== undefined) put(dir, "prs.json", text(prs));
    if (issues !== undefined) put(dir, "issues.json", text(issues));
    const args = ["plan", "--prs", join(dir, "prs.json"), ...(issues === undefined ? [] : ["--issues", join(dir, "issues.json")])];
    const out = await run(join(dir, SCRIPT), args, { dir, home, reg });
    return { ...out, json: out.stdout ? JSON.parse(out.stdout) : null };
  } finally {
    await reg.close();
  }
}

test("AC-698-1: the plan command reads the level from docs/stack.md and the open pull requests from a file", async () => {
  const first = await planWith([]);
  assert.deepEqual([first.status, first.json], [0, { action: "pr", version: "0.8.0", bump: "minor", fyi: false }]);
  const second = await planWith([pr("chore/4-update-onrails")]);
  assert.deepEqual([second.json.action, second.json.pr], ["wait", "chore/4-update-onrails"]);
  assert.equal((await planWith([], { issues: [{ number: 9, title: "Update onRails to 0.8.0" }] })).json.action, "wait");
  assert.equal((await planWith([], { issues: [{ number: 9, title: "Something else" }] })).json.action, "pr");
});

test("AC-698-1: the plan command reads gh's --paginate --slurp output (a list of pages) as one list", async () => {
  assert.equal((await planWith([[pr("feat/1-x")], [pr("chore/4-update-onrails")]])).json.action, "wait");
  assert.equal((await planWith([[pr("feat/1-x")], []])).json.action, "pr");
});

test("AC-698-2: the plan command says suggest and FYI for a major version, and opens nothing", async () => {
  const out = await planWith([], { version: "1.0.0" });
  assert.deepEqual([out.status, out.json], [0, { action: "suggest", version: "1.0.0", bump: "major", fyi: true }]);
});

test("AC-698-3: the plan command suggests below Full and when the profile says on_full = suggest", async () => {
  assert.equal((await planWith([], { stack: "- **Level:** recommended\n" })).json.action, "suggest");
  assert.equal((await planWith([], { stack: "" })).json.action, "suggest");
  assert.equal((await planWith([], { profile: '[updates]\non_full = "suggest"\n' })).json.action, "suggest");
});

test("AC-698-4: WHEN the list of open pull requests can't be read THEN the plan command exits 2 and never says to open one", async () => {
  const unreadable = [["no file", undefined], ["an empty file", ""], ["not JSON", "<html>502</html>"], ["an error object", { message: "Bad credentials" }], ["null", "null"]];
  for (const [name, list] of unreadable) {
    const out = await planWith(list);
    assert.equal(out.status, 2, name);
    assert.equal(out.stdout, "", name);
    assert.ok(!/"pr"/.test(out.stdout), name);
  }
  const badIssues = await planWith([], { issues: { message: "Not Found" } });
  assert.deepEqual([badIssues.status, badIssues.stdout], [2, ""]);
});

const skill = (name) => readFileSync(join(REPO, `.agents/skills/${name}/SKILL.md`), "utf8");

test("AC-698-1: /back and the loop run the plan with the open pull requests, file one issue, and name the branch", () => {
  for (const name of ["back", "coordinate"]) {
    const text = skill(name);
    assert.match(text, /update\/scripts\/latest\.mjs plan --prs /, name);
    assert.match(text, /pulls\?state=open&per_page=100" --paginate --slurp/, name);
    assert.match(text, /issues\?state=open/, name);
    assert.match(text, /Update onRails to <version>/, name);
    assert.match(text, /chore\/<n>-update-onrails/, name);
  }
});

test("AC-698-2: /back and the loop keep a major version a suggestion with an FYI", () => {
  for (const name of ["back", "coordinate"]) assert.match(skill(name), /major[^\n]*FYI/i, name);
});

test("AC-698-3: /back and the loop open nothing below Full or when on_full is suggest", () => {
  for (const name of ["back", "coordinate"]) assert.match(skill(name), /on_full = "suggest"/, name);
});

test("AC-698-1: the update skill's pull request steps run the CLI from a temp folder, without --all, and end on the last step", () => {
  const text = skill("update");
  const section = text.split(/^## /m).find((s) => s.startsWith("On Full, as a pull request")) ?? "";
  assert.match(section, /chore\/<n>-update-onrails/);
  assert.match(section, /mktemp -d \/tmp\/onrails-update/);
  assert.match(section, /npx --yes onrails@latest update "<project root>"\)/);
  assert.ok(!/update "<project root>" --all/.test(section), "the plugins and global skills belong to the machine");
  assert.match(section, /Closes #<n>/);
  assert.match(section, /never (?:cut a release|bump)/i);
  assert.match(text.trimEnd().split("\n").at(-1), /^Claude Code can't reload a running session's plugins itself, so end with this line, word for word: "Last step: /);
});
