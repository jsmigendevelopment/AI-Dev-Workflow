// #478: on Full, `agent-files.mjs gate` follows the review carry. A writer's `Weakening review: pass` at an earlier
// commit stands when the head is a chain of clean merges of origin/main on top of it, each proved the way
// `insights.mjs carry` proves one. The git set-up is insights-carry-fakes.mjs; gh is a fake that answers for the pull
// request, which changes an agent file on a Full repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { fakeGh, tmp, unixOnly } from "./helpers.mjs";
import { CLASH, FEAT, conflictFix, handEdit, mergeMain, push, reviewed } from "./insights-carry-fakes.mjs";
import { SCRIPTS, branch, git, put } from "./insights-land-fakes.mjs";

const P = "repos/acme/app";
const FULL = "## Automation level\n\n- **Level:** full\n";
const RECOMMENDED = "## Automation level\n\n- **Level:** recommended\n";
const stackFile = (text) => ({ type: "file", encoding: "base64", path: "docs/stack.md", content: Buffer.from(text).toString("base64") });
const say = (login, verdict, sha) => ({ user: { login }, body: `Weakening review: ${verdict} @ ${sha}` });
const ACCESS = { writer: "write", reader: "read" };

/**
 * The gate in the coordinator's checkout of main (fx.dir) at `head`, with these comments on the pull request. `cwd` is
 * the folder it is started in (main's checkout unless a test says otherwise); `stack` is docs/stack.md on main.
 */
function gate(fx, head, comments, { cwd = fx.dir, stack = FULL } = {}) {
  const fake = fakeGh(tmp("onrails-gh-"), {
    [`${P}/pulls/40`]: { head: { sha: head }, base: { sha: "e".repeat(40), ref: "main" }, changed_files: 1 },
    [`${P}/pulls/40/files`]: [{ filename: ".agents/skills/build/SKILL.md", status: "modified" }],
    [`${P}/issues/40/comments`]: comments,
    [`${P}/issues/40/labels`]: [],
    [`${P}/contents/docs/stack.md`]: stackFile(stack),
    ...Object.fromEntries(Object.entries(ACCESS).map(([login, permission]) => [`${P}/collaborators/${login}/permission`, { permission }])),
  });
  const script = join(fx.dir, SCRIPTS, "agent-files.mjs");
  return spawnSync(process.execPath, [script, "gate", "40", "--repo", "acme/app", "--head", head], { cwd, encoding: "utf8", env: fake.env });
}

/** Main moves on again after the branch merged it. */
function moveMain(fx, files) {
  branch(fx.seed, "main", files);
  git(fx.seed, "checkout", "-q", FEAT);
  git(fx.seed, "fetch", "-q", "origin");
}

/** A reviewed branch, main merged in cleanly, main moved again, and merged in cleanly again: [reviewed, first, second]. */
function twoMerges() {
  const fx = reviewed();
  const first = mergeMain(fx);
  moveMain(fx, { "later.txt": "later\n" });
  return { fx, chain: [fx.from, first, mergeMain(fx)] };
}

test("AC-478-1: WHEN the head is a clean merge of origin/main into a commit with a writer's Weakening review: pass THEN gate exits 0 and names the carried sha", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  const r = gate(fx, to, [say("writer", "pass", fx.from)]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(fx.from), `names the carried sha: ${r.stdout}`);
  assert.ok(r.stdout.includes(to), `names the head: ${r.stdout}`);
});

test("#478: a chain of clean merges of main carries the pass, one proved step at a time", unixOnly, () => {
  const { fx, chain } = twoMerges();
  const r = gate(fx, chain[2], [say("writer", "pass", chain[0])]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(chain[0]), r.stdout);
  const mid = gate(fx, chain[2], [say("writer", "pass", chain[1])]);
  assert.equal(mid.status, 0, `a pass at the first merge carries too: ${mid.stderr}`);
  assert.ok(mid.stdout.includes(chain[1]), mid.stdout);
});

test("AC-478-2: WHEN the head adds any change beyond main's (a conflict fix or a new commit) THEN gate exits 1 and asks for a line at the head", unixOnly, () => {
  // Each case says why the earlier pass doesn't carry, in carry's own words.
  const cases = {
    "a conflict fix": [/conflicts/, (fx) => conflictFix(fx)],
    "a change of its own in the merge": [/a change of its own/, (fx) => handEdit(fx)],
    "a new commit after the merge": [/1 parent\(s\), so it isn't a merge of main/, (fx) => {
      mergeMain(fx);
      put(fx.seed, "late.txt", "late\n");
      git(fx.seed, "add", "late.txt");
      git(fx.seed, "commit", "-q", "-m", "late");
      return push(fx);
    }],
  };
  for (const [name, [why, make]] of Object.entries(cases)) {
    const fx = reviewed(name === "a conflict fix" ? CLASH : {});
    const head = make(fx);
    const r = gate(fx, head, [say("writer", "pass", fx.from)]);
    assert.equal(r.status, 1, `${name}: ${r.stdout}`);
    assert.ok(r.stderr.includes(`Weakening review: pass @ ${head}`), `${name}: asks for a line at the head: ${r.stderr}`);
    assert.match(r.stderr, why, `${name}: says why the pass at ${fx.from} doesn't carry`);
  }
});

test("#478: a chain with a change of its own at any step needs a line at the head", unixOnly, () => {
  const fx = reviewed();
  mergeMain(fx);
  moveMain(fx, { "later.txt": "later\n" });
  const head = handEdit(fx);
  const r = gate(fx, head, [say("writer", "pass", fx.from)]);
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stderr.includes(`Weakening review: pass @ ${head}`), r.stderr);
  assert.match(r.stderr, /a change of its own/, r.stderr);
});

test("AC-478-3: WHEN the passing line is from a read-only login, or a fail line follows it THEN gate still exits 1", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  const reader = gate(fx, to, [say("reader", "pass", fx.from)]);
  assert.equal(reader.status, 1, `a read-only login's pass doesn't carry: ${reader.stdout}`);
  const failed = gate(fx, to, [say("writer", "pass", fx.from), say("writer", "fail", fx.from)]);
  assert.equal(failed.status, 1, `a fail after the pass blocks: ${failed.stdout}`);
  assert.match(failed.stderr, /failed/);
});

test("#478: a fail at any commit of the chain blocks the carried pass", unixOnly, () => {
  const { fx, chain } = twoMerges();
  const r = gate(fx, chain[2], [say("writer", "pass", chain[0]), say("writer", "fail", chain[1])]);
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stderr.includes(chain[1]), `names the commit that failed: ${r.stderr}`);
});

test("#478 round 1: the proof reads main's checkout, where the script is, even when the gate starts in the branch's clone", unixOnly, () => {
  // The branch adds a merge rule that joins both sides of README.md, so the merge is clean only under the branch's rules.
  const fx = reviewed({ ...CLASH, feature: { "README.md": "feature\n", ".gitattributes": "*.md merge=union\n" } });
  const head = mergeMain(fx);
  const comments = [say("writer", "pass", fx.from)];
  const fromClone = gate(fx, head, comments, { cwd: fx.seed });
  assert.equal(fromClone.status, 1, `started in the branch's clone: ${fromClone.stdout}`);
  assert.match(fromClone.stderr, /conflicts/, fromClone.stderr);
  const fromMain = gate(fx, head, comments);
  assert.equal(fromMain.status, 1, fromMain.stdout);
  assert.match(fromMain.stderr, /conflicts/, fromMain.stderr);
});

test("#478 round 1: the carry stops after 20 clean merges of main, and says so", unixOnly, () => {
  const fx = reviewed();
  const chain = [fx.from];
  for (let i = 1; i <= 21; i++) {
    if (i > 1) moveMain(fx, { [`main-${i}.txt`]: `${i}\n` });
    chain.push(mergeMain(fx));
  }
  const head = chain[21];
  const twenty = gate(fx, head, [say("writer", "pass", chain[1])]);
  assert.equal(twenty.status, 0, `20 merges back carries: ${twenty.stderr}`);
  const past = gate(fx, head, [say("writer", "pass", chain[0])]);
  assert.equal(past.status, 1, `21 merges back doesn't: ${past.stdout}`);
  assert.match(past.stderr, /within 20 clean merges of main/, past.stderr);
  assert.ok(past.stderr.includes(`Weakening review: pass @ ${head}`), past.stderr);
});

test("#478 round 1: on Recommended a clean merge of main carries nothing, and the gate asks for the label", unixOnly, () => {
  const fx = reviewed();
  const head = mergeMain(fx);
  const r = gate(fx, head, [say("writer", "pass", fx.from)], { stack: RECOMMENDED });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /human-approved label/, r.stderr);
  assert.doesNotMatch(r.stderr, /carr/, `no carry on Recommended: ${r.stderr}`);
});

test("#478 round 1: a merge of a branch that isn't main carries nothing", unixOnly, () => {
  const fx = reviewed();
  branch(fx.seed, "other", { "other.txt": "other\n" });
  git(fx.seed, "checkout", "-q", FEAT);
  git(fx.seed, "merge", "-q", "--no-edit", "origin/other");
  const head = push(fx);
  const r = gate(fx, head, [say("writer", "pass", fx.from)]);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /isn't on origin\/main/, r.stderr);
  assert.ok(r.stderr.includes(`Weakening review: pass @ ${head}`), r.stderr);
});
