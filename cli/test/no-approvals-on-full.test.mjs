// #173 review rounds 1 to 4: the "no approvals on Full" scan reads each clause for its own condition, checks every ask,
// and catches more ways to ask the person, and the lines it now finds say what happens on Full. AC-173-1 to AC-173-5 are in
// standing-decisions.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { asks, asks199, mdFiles, read, scan, unconditionalAsks } from "./approval-scan.mjs";

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
  // Round 4: a parenthesis inside the ask's own words doesn't cut it either, so the condition after it is in the asking clause.
  assert.deepEqual(unconditionalAsks("Ask the person (for this one, and the next) to review it below Full."), []);
  assert.deepEqual(unconditionalAsks("Ask the person (for this one, and the next) to review it."), ["Ask the person (for this one, and the next) to review it."]);
  // The parenthesis is still read: with no condition, or with "on Full too", the ask is flagged.
  for (const s of ["Ask the person to review it (only for risky changes, and big ones).", "Ask the person to review it (only for risky changes, and on Full too)."]) {
    assert.deepEqual(unconditionalAsks(s), [s], s);
  }
  assert.match(read("docs/decisions.md"), /A parenthesis belongs to its clause, so a condition inside it counts there: [^|]*fixes a false alarm on main/);
  assert.match(read("docs/decisions.md"), /parenthesis sits inside the ask's own words: [^|]*passes/);
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

// #199: the phrasings the round 2 review of #193 found, the two edge cases main misses too, and a host that isn't GitHub.
const LOCAL_MODE = ".agents/skills/coordinate/references/local-mode.md";
const NAMED_199 = [".agents/skills/stack-tanstack-start/SKILL.md", ".agents/skills/test-by-hand-as-the-user/references/browsers.md"];

test("AC-199-1: WHEN the scan reads each phrasing in #199 item 2 without a below-Full condition THEN it flags it, and the named files stay green", () => {
  const phrasings = ["Install only after the person says yes.", "Creating resources goes through `setup-cloudflare`: dry run, scoped tokens, ask first.",
    "A test needs it? Warn the person first.", "Stuck on one? Ask them to close it in Chrome.", "Stop, say what you tried, and ask how to go on."];
  for (const s of phrasings) {
    const asks = unconditionalAsks(s);
    assert.equal(asks.length, 1, s);
    assert.ok(s.endsWith(asks[0]), s);
  }
  for (const s of ["Below Full, install only after the person says yes.", "Below Full, ask first.", "Below Full, warn the person first.",
    "Below Full, ask them to close it in Chrome.", "Below Full, ask how to go on."]) assert.deepEqual(unconditionalAsks(s), [], s);
  assert.deepEqual(scan(NAMED_199).found, []);
  const tanstack = read(NAMED_199[0]);
  assert.match(tanstack, /Below Full, install only after the person says yes\./);
  assert.match(tanstack, /Creating resources still goes through `setup-cloudflare`: dry run and scoped tokens, and below Full, ask first\. Anything in production waits for a yes at every level: it is on the always-stop list\./);
  const browsers = read(NAMED_199[1]);
  assert.match(browsers, /A test needs it\? Below Full, warn the person first\. On Full, don't click it: list it as not tested and put it in the FYI\./);
  assert.match(browsers, /Stuck on one\? Below Full, ask them to close it in Chrome\. On Full, leave that tab, list what's left in it as not tested and put it in the FYI\./);
  assert.match(browsers, /Stop and say what you tried\. Below Full, ask how to go on\. On Full, mark that row not tested, put what you tried in the FYI and go on with the rest\./);
});

test("AC-199-2: WHEN a sentence has \"(on Full, too)\" or a bold Below Full label over an \"at Full\" clause THEN the scan flags it", () => {
  for (const s of ["Below Full, the person merges it (on Full, too).", "Below Full, the person approves every merge (on Full, as well).",
    "Below Full, the person merges it (also on Full, too).", "Below Full, the person merges it (and on Full, too, the same).",
    "- **Below Full:** nothing changes; at Full the person merges it.", "- **Below Full:** nothing changes; in Full automation the person merges it.",
    "- **Below Full:** nothing changes; at full speed, the person merges it."]) assert.deepEqual(unconditionalAsks(s), [s], s);
  // The label still covers a clause that names no Full of its own.
  assert.deepEqual(unconditionalAsks("- **Below Full:** it is `needs-human`, and only the person adds `human-approved`."), []);
});

test("#199 scope addition: a parenthesis after the ask, with the condition after it in the same clause, passes", () => {
  assert.deepEqual(unconditionalAsks("Ask the person to review it (only for risky changes, and big ones) below Full."), []);
  assert.deepEqual(unconditionalAsks("Ask the person to review it (only for risky changes, and big ones)."), ["Ask the person to review it (only for risky changes, and big ones)."]);
});

// #199 item 1 is tested by its text only: nothing here runs `glab`, `tea` or `bb`.
test("#199 item 1: on a host that isn't GitHub, the loop merges through that host's own CLI when it is signed in, and otherwise queues", () => {
  const text = read(LOCAL_MODE);
  assert.match(text, /\| \*\*Push, no API: another host\*\* \| a remote that isn't GitHub \| files in `docs\/issues\/` \| through that host's own CLI when the session is signed in to it \(step 8\); otherwise queued for the person to merge on that host\. The loop keeps building \|/);
  const step8 = text.match(/^8\. \*\*Another host:\*\*[\s\S]*?(?=\n\n)/m)?.[0] ?? "";
  assert.match(step8, /`glab` \(GitLab\) or `tea` \(Gitea\)/);
  assert.match(step8, /\*\*Signed in to that tool\*\* \(its own sign-in check passes, such as `glab auth status`\)\? Merge through it the way the loop merges on GitHub, under the same gates \(`coordinate` step 6\.5\)/);
  assert.match(step8, /merge only when it equals the reviewed sha\. Never merge by branch name, and never push main\./);
  assert.match(step8, /\*\*Not signed in, or no such tool\?\*\* Keep the queue\. Below Full, send the new queue lines to the person each sweep as one ⏳ decision through `ask`[^.]*\. On Full, put them in the next batched ℹ️ FYI and keep building\./);
  assert.deepEqual(scan([LOCAL_MODE]).found, []);
});

// #211: "ask the person to <any verb>", "ask what to do", "stop and ask", and "ask first" wherever it is an order.
test("AC-211-1: WHEN the scan reads \"Ask the person to <verb> ...\" without a below-Full condition THEN it flags it, and the whole-file scan stays green", () => {
  const phrasings = ["Ask the person to describe the idea.", "Ask the owner to run the script.", "If it fails, ask them to rotate that key.",
    "Ask you to paste it.", "Ask what to do when it does:", "Use the preview, or stop and ask.", "Ask first, then wait.",
    "Buy it (money: ask first).", "So ask first unless the profile says not to.", "**Ask first, and name the account.**"];
  for (const s of phrasings) assert.deepEqual(unconditionalAsks(s), [s], s);
  for (const s of ["Below Full, ask the person to describe the idea.", "Below Full, ask what to do.", "Use the preview, or, below Full, stop and ask.",
    "Below Full, ask first, then wait."]) assert.deepEqual(unconditionalAsks(s), [], s);
  // Not asks: a topic, or someone else asking.
  for (const s of ["What to ask first.", "We ask first.", "They ask first, and we answer."]) assert.deepEqual(unconditionalAsks(s), [], s);
  const files = [".agents/skills/afk/SKILL.md", ".agents/skills/idea/SKILL.md", ".agents/skills/name/SKILL.md", ".agents/skills/secrets/SKILL.md",
    ".agents/skills/test-by-hand-as-the-user/SKILL.md", ".agents/skills/qa/SKILL.md", "stacks/unity/PACK.md", "stacks/tanstack-start-addons/analytics/ADDON.md"];
  assert.deepEqual(scan(files).found, []);
  assert.ok(read(files[4]).includes("Use a test account or the preview, or, below Full, stop and ask. On Full, list it as not tested and put it in the FYI."));
  assert.ok(read(files[2]).includes("ask them to run `gh auth login` first. On Full, park it in the FYI and carry on locally."));
});

test("AC-211-2: WHEN main's scan and the new one read every .md line and a generated set THEN no sentence main flags passes the new one", () => {
  const notAsks = /\b(?:what to|we|they|I|who) ask first\b/i;
  const lines = ["AGENTS.md", "README.md", ...mdFiles(".agents/skills"), ...mdFiles("guide"), ...mdFiles("stacks"), ...mdFiles("docs")].flatMap((f) => read(f).split("\n"));
  const who = ["the person", "the owner", "them", "you"];
  const generated = who.flatMap((w) => ["close it", "click it", "approve it", "review it", "run it"].flatMap((v) => [`Ask ${w} to ${v}.`, `Then ask ${w} to ${v} first.`]))
    .concat(["Ask first.", "Then ask first.", "**ask first.**", "It doesn't ask first.", "What to ask first.", "Ask how to go on.", "Ask the person.", "Ask them first."]);
  for (const s of [...lines.flatMap((l) => l.split(/(?<=[.!?])\s+/)), ...generated]) {
    if (asks199(s) && !notAsks.test(s)) assert.ok(asks(s), s);
  }
});
