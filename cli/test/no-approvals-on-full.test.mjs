// #173 review rounds 1 to 4: the "no approvals on Full" scan reads each clause for its own condition, checks every ask,
// and catches more ways to ask the person, and the lines it now finds say what happens on Full. AC-173-1 to AC-173-5 are in
// standing-decisions.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, scan, unconditionalAsks } from "./approval-scan.mjs";

const AGENTS = ["AGENTS.md", "cli/kit/files/core/AGENTS.md", "plugin/cli/kit/files/core/AGENTS.md"];

test("#173 round 1 nice 1: a bold label doesn't cover a clause that names Full, and \"(on Full too)\" counts against its clause", () => {
  for (const s of ["- **Below Full:** nothing changes; on Full the person merges it.", "Below Full, the person merges it (on Full too).",
    "Below Full, the person approves every merge (on Full as well)."]) assert.deepEqual(unconditionalAsks(s), [s], s);
  // A label still covers the clauses that go on with its own level.
  for (const s of ["- **Below Full:** it is `needs-human`, and only the person adds `human-approved`.", "- **Below Full:** the person merges it; nothing else waits."]) {
    assert.deepEqual(unconditionalAsks(s), [], s);
  }
});

test("#173 round 2 must: an ask that no single clause holds needs its condition before it, and no \"(on Full too)\"", () => {
  for (const s of ["Ask the owner about it, and review it later (below Full).", "Ask the person for the screenshots, and get their review on it, below Full.",
    "Ask the person to look, and approve it, not on Full."]) assert.deepEqual(unconditionalAsks(s), [s], s);
  // Main's rule still governs a condition that comes first.
  assert.deepEqual(unconditionalAsks("Below Full, ask the owner about it, and review it later."), []);
});

test("#173 round 3 must: every ask is checked, so a later asking clause with its own condition can't hide one that runs across a cut", () => {
  for (const s of ["Ask the owner about it, and review it later; below Full, wait for the person.",
    "Ask the person to look, and approve it; below Full, check with the owner.",
    "Ask the person for the screenshots, and get their review on it; below Full, ask the person.",
    "Ask the owner about it, and review it later; below Full, tell them and wait."]) assert.deepEqual(unconditionalAsks(s), [s], s);
  assert.deepEqual(unconditionalAsks("Below Full, ask the owner about it, and review it later."), []);
});

test("#173 round 4 must: an ask is the match the scan makes from its first word, so a shorter ask from that word can't hold it", () => {
  for (const s of ["Ask the person before you start below Full, and get their review on it.", "Ask the person before you start below Full, and approve it.",
    "Ask the person to look below Full, then wait, and get their review on it.", "Ask the person to look below Full and wait, and get their review on it."]) {
    assert.deepEqual(unconditionalAsks(s), [s], s);
  }
  // The short ask still counts on its own when the match ends in its clause.
  for (const s of ["Ask the person before you start below Full, and go on.", "Below Full, ask the person before you start, and get their review on it."]) {
    assert.deepEqual(unconditionalAsks(s), [], s);
  }
  assert.match(read("docs/decisions.md"), /The ask is the match the scan makes from its first word, not a shorter one/);
});

test("#173 round 3 nice 1: a parenthesis belongs to its clause, so a condition inside it counts there (main flagged this)", () => {
  assert.deepEqual(unconditionalAsks("Ask the person to review it (only for risky changes, and below Full)."), []);
  // The parenthesis is still read: with no condition, or with "on Full too", the ask is flagged.
  for (const s of ["Ask the person to review it (only for risky changes, and big ones).", "Ask the person to review it (only for risky changes, and on Full too)."]) {
    assert.deepEqual(unconditionalAsks(s), [s], s);
  }
  assert.match(read("docs/decisions.md"), /A parenthesis belongs to its clause, so a condition inside it counts there: [^|]*fixes a false alarm on main/);
});

test("#173 round 1 nice 2: the scan catches each phrasing the review listed", () => {
  const phrasings = ["Await the person's yes.", "Check with the owner first.", "Ask the person before you continue.", "Ask the person, then wait.",
    "Ping the person and wait.", "Wait for the person.", "Run it only after a yes.", "Ask the owner before starting (`ask`)."];
  for (const s of phrasings) assert.deepEqual(unconditionalAsks(s), [s], s);
  for (const s of ["Below Full, await the person's yes.", "Below Full, run it only after a yes.", "Wait for the build to finish."]) assert.deepEqual(unconditionalAsks(s), [], s);
});

test("#173 round 1 nice 2: the lines the wider scan found say what happens on Full", () => {
  const handoff = "Could the owner's words (not the summary) mean something else? Below Full, ask the owner before starting (`ask`). On Full, start on the reading you recommend, record it as \"AI pick, not reviewed\" and put the other readings in the FYI.";
  for (const file of AGENTS) assert.ok(read(file).includes(handoff), `${file}: the Handoffs line`);
  assert.match(read(".agents/skills/ask/references/handoffs.md"), /Below Full, ask the owner before you start\. It's a ⏳ decision through `ask`: quote the words, give each reading, and recommend one\. Start nothing on it until they answer\. Other work keeps going\. On Full, start on the reading you recommend, record it as "AI pick, not reviewed" and put the other readings in the FYI\./);
  assert.match(read(".agents/skills/stack-tanstack-start/SKILL.md"), /run `node scripts\/setup-cloudflare\.mjs --dry-run`, show the person the output\. Below Full, run it without `--dry-run` only after a yes \(see Environments and deploys\)\./);
  assert.match(read(".agents/skills/pyramid/SKILL.md"), /Below Full, say in one line what it does \(labels, Dependabot, secret scanning, rules on main; on `ci = "actions"` only, a production environment that waits for them\) and ask: \*"Set this up now\?"\*/);
  assert.deepEqual(scan(["AGENTS.md", ".agents/skills/ask/references/handoffs.md", ".agents/skills/stack-tanstack-start/SKILL.md", ".agents/skills/pyramid/SKILL.md"]).found, []);
});

test("#173 round 2 nice 1: AGENTS.md and handoffs.md say the same thing on Full", () => {
  const onFull = "On Full, start on the reading you recommend, record it as \"AI pick, not reviewed\" and put the other readings in the FYI.";
  for (const file of [...AGENTS, ".agents/skills/ask/references/handoffs.md"]) assert.ok(read(file).includes(onFull), `${file}: the On Full handoff line`);
  assert.deepEqual(new Set(AGENTS.map(read)).size, 1, "the three AGENTS.md copies are identical");
});

test("#173 round 1 nice 4: pyramid's gh auth login line parks the sign-in on Full and goes on", () => {
  assert.ok(read(".agents/skills/pyramid/SKILL.md").includes("If `gh auth status` fails, ask them to run `gh auth login` and wait. On Full, park it in the FYI and keep doing what doesn't need GitHub."));
});
