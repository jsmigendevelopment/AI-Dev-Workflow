// #112: the sweep can see a missing receipt. The board's issue read fetches the comments, the coordinator's step 10
// and `/back` run the orphan script on it and match `Handoff ·` comments, and a new repo has the labels they use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gh, repo, run, SETUP, UNIX } from "./secrets-fakes.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../.agents/skills/${p}`, import.meta.url)), "utf8");
const between = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `found ${start}`);
  return text.slice(from, text.indexOf(end, from + start.length));
};
const STEP_10 = between(read("coordinate/SKILL.md"), "10. **End of sweep:**", "## End of a pass");
const BACK_3 = between(read("back/SKILL.md"), "3. **Check GitHub**", "\n4. ");
const SWEEP = between(read("ask/references/handoffs.md"), "## The orphan sweep", "\n## ");

test("AC-112-4: WHEN the coordinator runs its orphan check THEN step 10 names the comment fetch, and board.md's issue read asks for comments", () => {
  const check = STEP_10.split("\n").find((l) => l.includes("**orphan check:**"));
  assert.ok(check, "step 10 has an orphan check");
  assert.match(check, /orphans\.mjs/);
  assert.match(check, /`comments`/);
  const fetch = read("coordinate/board.md").split("\n").find((l) => l.startsWith("gh issue list"));
  assert.match(fetch, /--json [\w,]*\bcomments\b/);
  assert.match(fetch, /--json [\w,]*\bbody\b/);
  assert.match(fetch, /--json [\w,]*\bcreatedAt\b/);
});

test("AC-112-5: WHEN the sweeps look for handoffs THEN they match `Handoff ·` comments as well as the label, and /back runs the same script", () => {
  for (const [name, text] of [["coordinate step 10", STEP_10], ["back step 3", BACK_3], ["handoffs.md", SWEEP]]) {
    assert.match(text, /`Handoff ·` comment/, name);
  }
  assert.match(BACK_3, /orphans\.mjs/);
});

test("AC-112-3: WHEN the sweep text says when a receipt is missing THEN it counts only past the check-by time", () => {
  for (const [name, text] of [["coordinate step 10", STEP_10], ["back step 3", BACK_3], ["handoffs.md", SWEEP]]) {
    assert.match(text, /no `Got it ·` receipt once past its "check by" time/, name);
  }
});

test("AC-112-3: WHEN a record names no check-by time THEN step 10, back step 3 and handoffs.md all give the 2-hour default", () => {
  for (const [name, text] of [["coordinate step 10", STEP_10], ["back step 3", BACK_3], ["handoffs.md", SWEEP]]) {
    assert.match(text, /no `Got it ·` receipt once past its "check by" time \(2 hours after the record when it names none\)/, name);
  }
});

test("AC-112-6: WHEN the sweep checks for stale claims THEN step 10, back step 3 and the board fetch the claimed branches right before, and an unknown branch is never retaken", () => {
  const FETCH = "git fetch origin --prune";
  for (const [name, text] of [["coordinate step 10", STEP_10.split("\n").find((l) => l.includes("**orphan check:**"))], ["back step 3", BACK_3]]) {
    assert.ok(text.includes(FETCH) && text.indexOf(FETCH) < text.indexOf("orphans.mjs"), `${name}: the fetch comes right before the run`);
    assert.match(text, /`unknown`/, name);
  }
  assert.match(STEP_10, /never retake a claim on an `unknown`/);
  const render = between(read("coordinate/board.md"), "## Render", "## The Google Sheet");
  assert.ok(render.includes(FETCH) && render.indexOf(FETCH) < render.indexOf("board.mjs render"), "board.md: the fetch comes before the render");
});

test("AC-112-5: WHEN setup-github runs on a new repo THEN it creates the handoff and blocker labels", UNIX, () => {
  const r = run(SETUP, repo(), ["--plan", "free"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const made = gh(r.calls).filter((c) => c.argv[0] === "label" && c.argv[1] === "create").map((c) => c.argv[2]);
  for (const label of ["handoff", "blocker", "needs-human"]) assert.ok(made.includes(label), `${label} in ${made.join(", ")}`);
});
