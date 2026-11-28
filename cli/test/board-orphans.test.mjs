// #112: the orphan sweep as a script. The board and `/back` list a stale claim and a handoff with no receipt from the
// issue list the sweep already fetched, with its comments. A missing receipt counts only past its "check by" time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const BOARD = join(REPO, ".agents/skills/coordinate/scripts/board.mjs");
const ORPHANS = join(REPO, ".agents/skills/coordinate/scripts/orphans.mjs");
const NOW = "2026-11-27T12:00:00Z";

// gh's `comments` carry authorAssociation; only the repo's own people count (round 1 of the review on #395).
const comment = (createdAt, body, authorAssociation = "MEMBER") => ({ author: { login: "me" }, authorAssociation, createdAt, body });
const claim = (n, at, extra = "") => comment(at, `Claimed by builder-${n} at ${at.slice(0, 16).replace("T", " ")} UTC · branch feat/${n}-work${extra}`);
const gotIt = (at) => comment(at, "Got it · builder · My reading: build the issue as written.");
const issue = (number, labels, comments, more = {}) => ({ number, title: `Issue ${number}`, url: `https://github.com/acme/app/issues/${number}`, labels: labels.map((name) => ({ name })), updatedAt: NOW, body: "", comments, ...more });
const HANDOFF_10 = "Handoff · main thread → docs thread · check by 2026-11-27 10:00 UTC\n\nOwner's words: \"Tidy the README.\"";

// What the sweep fetched. #7 is a stale claim, #10 a handoff comment with no receipt past its check-by time.
// The rest are fine: #8 has a fresh commit, #9 and #13 are inside their grace period, #11 has its receipt,
// and #12 sits in review with no new commit, which is not stale.
const ISSUES = [
  issue(7, ["status:in-progress"], [claim(7, "2026-11-27T08:00:00Z"), gotIt("2026-11-27T08:05:00Z")]),
  issue(8, ["status:in-progress"], [claim(8, "2026-11-27T08:00:00Z"), gotIt("2026-11-27T08:05:00Z")]),
  issue(9, ["status:in-progress"], [claim(9, "2026-11-27T11:00:00Z", " · check by 2026-11-27 13:00 UTC")]),
  issue(10, [], [comment("2026-11-27T09:00:00Z", HANDOFF_10)]),
  issue(11, ["handoff"], [gotIt("2026-11-27T10:10:00Z")], { createdAt: "2026-11-27T10:00:00Z", body: "Handoff · main → design · check by 2026-11-27 11:00 UTC\n\nOwner's words: \"Darker.\"" }),
  issue(12, ["status:in-progress"], [claim(12, "2026-11-27T06:00:00Z"), gotIt("2026-11-27T06:05:00Z")]),
  issue(13, ["status:in-progress"], [claim(13, "2026-11-27T11:00:00Z")]),
];
const PRS = [{ number: 40, title: "Issue 12", url: "https://github.com/acme/app/pull/40", headRefName: "feat/12-work", labels: [], isDraft: false, updatedAt: "2026-11-27T07:00:00Z" }];

/** A git repo whose claimed branches have their last commits at the given times, and the sweep's two lists. */
function project() {
  const dir = tmp("onrails-orphans-");
  const git = (args, date) => execFileSync("git", ["-C", dir, ...args], { env: safeEnv({ GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }) });
  git(["init", "-q", "-b", "main"]);
  git(["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "start"], "2026-11-27T05:00:00Z");
  for (const [n, at] of [[7, "2026-11-27T09:00:00Z"], [8, "2026-11-27T11:30:00Z"], [12, "2026-11-27T06:30:00Z"]]) {
    git(["checkout", "-q", "-b", `feat/${n}-work`, "main"]);
    git(["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", `#${n}`], at);
  }
  git(["checkout", "-q", "main"]);
  writeFileSync(join(dir, "issues.json"), JSON.stringify(ISSUES));
  writeFileSync(join(dir, "prs.json"), JSON.stringify(PRS));
  return dir;
}

const run = (dir, script, args, now = NOW) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: "utf8", env: safeEnv({ HOME: dir, USERPROFILE: dir, CLAUDE_PROJECT_DIR: "", ONRAILS_NOW: now, TZ: "UTC" }) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
};
const lists = ["--github", "issues.json", "--github", "prs.json"];
const section = (board, heading) => board.split(/^## /m).find((s) => s.startsWith(heading)) ?? "";
const numbers = (text) => [...text.matchAll(/#(\d+)\b/g)].map((m) => Number(m[1]));

test("AC-112-6: WHEN the board renders the sweep's lists THEN a stale claim and a handoff with no receipt are waiting on the person, and nothing else", () => {
  const dir = project();
  const board = run(dir, BOARD, ["render", "--project", "app", ...lists, "--print"]);
  const waiting = section(board, "⏳ Waiting on your decision");
  assert.deepEqual([...new Set(numbers(waiting))].sort((a, b) => a - b), [7, 10], waiting);
  assert.match(waiting, /#7\b.*stale claim/);
  assert.match(waiting, /#10\b.*no `Got it ·` receipt/);
});

test("AC-112-6: WHEN /back runs the orphan sweep THEN it prints the stale claim and the missing receipt, with the branch and the check-by time", () => {
  const dir = project();
  const out = run(dir, ORPHANS, lists);
  assert.deepEqual(numbers(out), [7, 10], out);
  assert.match(out, /#7 · stale claim · branch feat\/7-work · no commit since 2026-11-27 09:00 UTC/);
  assert.match(out, /#10 · no `Got it ·` receipt · past its check by, 2026-11-27 10:00 UTC/);
  const json = JSON.parse(run(dir, ORPHANS, [...lists, "--json"]));
  assert.deepEqual(json.map((o) => [o.issue, o.kind]), [[7, "stale-claim"], [10, "no-receipt"]]);
});

test("AC-112-3: WHEN a handoff has no receipt THEN it counts only once its check-by time has passed, or 2 hours with no check-by time", () => {
  const dir = project();
  const noReceipt = (now) => JSON.parse(run(dir, ORPHANS, [...lists, "--json"], now)).filter((o) => o.kind === "no-receipt").map((o) => o.issue);
  assert.deepEqual(noReceipt("2026-11-27T09:30:00Z"), [], "#10 is before its check-by time");
  assert.deepEqual(noReceipt("2026-11-27T12:00:00Z"), [10], "#9 and #13 are still inside their grace");
  assert.deepEqual(noReceipt("2026-11-27T13:30:00Z"), [9, 10, 13], "#9 is past its check-by time, #13 past 2 hours");
});

test("AC-112-5: WHEN a handoff is a comment on an issue with no handoff label THEN the sweep still finds it", () => {
  const dir = project();
  const unlabelled = ISSUES.find((i) => i.number === 10);
  assert.deepEqual(unlabelled.labels, []);
  assert.ok(JSON.parse(run(dir, ORPHANS, [...lists, "--json"])).some((o) => o.issue === 10));
  // A receipt after the record answers it.
  writeFileSync(join(dir, "issues.json"), JSON.stringify([{ ...unlabelled, comments: [...unlabelled.comments, gotIt("2026-11-27T11:00:00Z")] }]));
  assert.deepEqual(JSON.parse(run(dir, ORPHANS, ["--github", "issues.json", "--json"])), []);
});

// Round 1 of the review on #395. Each case runs the script on its own issue list in the same project.
const orphansOf = (dir, issues, { prs = [], now = NOW } = {}) => {
  writeFileSync(join(dir, "case-issues.json"), JSON.stringify(issues));
  writeFileSync(join(dir, "case-prs.json"), JSON.stringify(prs));
  return JSON.parse(run(dir, ORPHANS, ["--github", "case-issues.json", "--github", "case-prs.json", "--json"], now));
};
const claimOn = (branch, at) => comment(at, `Claimed by builder at ${at.slice(0, 16).replace("T", " ")} UTC · branch ${branch}`);
const claimed = (n, branch, at = "2026-11-27T06:00:00Z") => issue(n, ["status:in-progress"], [claimOn(branch, at), gotIt("2026-11-27T06:05:00Z")]);
const kinds = (found) => found.map((o) => [o.issue, o.kind]);

test("AC-112-6: WHEN a claim names a branch that starts with - or isn't a valid branch name THEN git never reads it as an option, and the claim is unknown, never stale", () => {
  const dir = project();
  const found = orphansOf(dir, [claimed(20, "--output=pwned.txt"), claimed(21, "feat/21..work"), claimed(22, "feat/22-work.lock")]);
  assert.equal(existsSync(join(dir, "pwned.txt")), false, "git wrote no file");
  assert.deepEqual(kinds(found), [[20, "unknown-branch"], [21, "unknown-branch"], [22, "unknown-branch"]]);
  assert.ok(found.every((o) => !o.note.includes("--output")), "the note doesn't repeat a name that isn't valid");
});

test("AC-112-6: WHEN a claimed branch has no local or origin ref THEN it is unknown (fetch first), never stale; within 2 hours it isn't listed", () => {
  const dir = project();
  assert.deepEqual(kinds(orphansOf(dir, [claimed(14, "feat/14-gone")])), [[14, "unknown-branch"]]);
  assert.match(orphansOf(dir, [claimed(14, "feat/14-gone")])[0].note, /feat\/14-gone.*fetch/);
  assert.deepEqual(orphansOf(dir, [claimed(14, "feat/14-gone", "2026-11-27T11:00:00Z")]), [], "a fresh claim may not be pushed yet");
});

test("AC-112-3: WHEN a check-by time isn't a real time or isn't UTC THEN the record gets the 2-hour default; an offset is read", () => {
  const dir = project();
  const handoff = (n, when) => issue(n, [], [comment("2026-11-27T09:00:00Z", `Handoff · a → b · check by ${when}\n\nOwner's words: "x"`)]);
  const at = (now, ...issues) => orphansOf(dir, issues, { now }).map((o) => o.issue);
  // A bad time, or a zone it can't read: due at 11:00, 2 hours after the record.
  for (const when of ["2026-11-27 25:00 UTC", "2026-13-27 10:00 UTC", "2026-02-30 10:00 UTC", "2026-11-27 10:00 PST", "2026-11-27 10:00"]) {
    assert.deepEqual(at("2026-11-27T10:30:00Z", handoff(30, when)), [], `${when}: not yet`);
    assert.deepEqual(at("2026-11-27T11:30:00Z", handoff(30, when)), [30], `${when}: past the default`);
  }
  assert.equal(orphansOf(dir, [handoff(30, "2026-11-27 25:00 UTC")], { now: "2026-11-27T11:30:00Z" })[0].since, Date.parse("2026-11-27T11:00:00Z"));
  // 12:00 at +01:00 is 11:00 UTC; Z and GMT are UTC.
  assert.deepEqual(at("2026-11-27T11:30:00Z", handoff(31, "2026-11-27 12:00 +01:00"), handoff(32, "2026-11-27T12:00Z"), handoff(33, "2026-11-27 12:00 GMT")), [31]);
});

test("AC-112-6: WHEN a claim's pull request is on another branch for the same issue, or the claim has leading spaces THEN the script reads it as the board does", () => {
  const dir = project();
  const pr = { number: 41, title: "Issue 8", url: "https://github.com/acme/app/pull/41", headRefName: "feat/8-work-v2", labels: [], isDraft: false, updatedAt: NOW };
  assert.deepEqual(orphansOf(dir, [claimed(8, "feat/8-old")], { prs: [pr] }), [], "#8 is in review");
  const spaced = issue(7, ["status:in-progress"], [comment("2026-11-27T08:00:00Z", "  \nClaimed by builder at 2026-11-27 08:00 UTC · branch feat/7-work"), gotIt("2026-11-27T08:05:00Z")]);
  assert.deepEqual(kinds(orphansOf(dir, [spaced])), [[7, "stale-claim"]]);
});

test("AC-112-5: WHEN someone outside the repo posts a receipt, a claim or a handoff THEN the sweep ignores it", () => {
  const dir = project();
  const outsider = (at, body) => comment(at, body, "NONE");
  const unanswered = issue(10, [], [comment("2026-11-27T09:00:00Z", HANDOFF_10), outsider("2026-11-27T09:30:00Z", "Got it · me · My reading: done.")]);
  const hidden = issue(7, ["status:in-progress"], [claimOn("feat/7-work", "2026-11-27T08:00:00Z"), gotIt("2026-11-27T08:05:00Z"), outsider("2026-11-27T11:50:00Z", "Claimed by me at 2026-11-27 11:50 UTC · branch feat/8-work")]);
  const fake = issue(15, [], [outsider("2026-11-27T06:00:00Z", "Handoff · x → y · check by 2026-11-27 07:00 UTC")]);
  assert.deepEqual(kinds(orphansOf(dir, [unanswered, hidden, fake])), [[7, "stale-claim"], [10, "no-receipt"]]);
});

// #397, from round 2 of the review on #395.
const HANDOFF_BODY = "Handoff · main thread → docs thread · check by 2026-11-27 10:00 UTC\n\nOwner's words: \"Tidy the README.\"";
const bodyHandoff = (n, login, more = {}) => issue(n, [], [], { author: { login }, createdAt: "2026-11-27T09:00:00Z", body: HANDOFF_BODY, ...more });

test("AC-397-2: WHEN an open issue's body starts with `Handoff ·` and has no label THEN the sweep lists it once past its check-by time", () => {
  const dir = project();
  // #8's claim is by "me", a MEMBER, so "me" is one of the repo's people; "stranger" never commented as one.
  const issues = [bodyHandoff(16, "me"), claimed(8, "feat/8-work"), bodyHandoff(17, "stranger")];
  assert.deepEqual(kinds(orphansOf(dir, issues, { now: "2026-11-27T09:30:00Z" })), [], "before its check-by time");
  assert.deepEqual(kinds(orphansOf(dir, issues)), [[16, "no-receipt"]], "once, and not the stranger's");
  const answered = bodyHandoff(16, "me", { comments: [gotIt("2026-11-27T09:30:00Z")] });
  assert.deepEqual(kinds(orphansOf(dir, [answered, claimed(8, "feat/8-work")])), [], "a receipt answers it");
});

// Round 2 of the review on #437, nice 2: in a personal repo the owner's login is in the issue's url.
test("AC-397-2: WHEN an unlabelled `Handoff ·` issue's author owns the repo in its url THEN it is listed with no trusted comment in the list", () => {
  const dir = project();
  const rest = { url: "https://api.github.com/repos/acme/app/issues/27", html_url: "https://github.com/acme/app/issues/27", user: { login: "acme" }, author: undefined };
  const issues = [bodyHandoff(25, "acme"), bodyHandoff(26, "ACME"), bodyHandoff(27, "x", rest), bodyHandoff(28, "acme-fan")];
  assert.deepEqual(kinds(orphansOf(dir, issues)), [[25, "no-receipt"], [26, "no-receipt"], [27, "no-receipt"]], "not acme-fan's");
});

// Round 3 of the review on #437, nice 4: an API url's `/repos/` segment is skipped, a github.com url's is not.
test("AC-445-2: WHEN an issue's url is an API url THEN its owner is read from the path, and `github.com/repos/<name>` is not an owner", () => {
  const dir = project();
  const api = { url: "https://api.github.com/repos/acme/app/issues/30", user: { login: "acme" }, author: undefined };
  const trap = { url: "https://github.com/repos/eve/app/issues/31" };
  const issues = [bodyHandoff(30, "x", api), bodyHandoff(31, "eve", trap), bodyHandoff(32, "eve", { url: "https://api.github.com/eve/app/issues/32" })];
  assert.deepEqual(kinds(orphansOf(dir, issues)), [[30, "no-receipt"]], "acme from the API url, and eve from neither odd one");
});

test("AC-397-3: WHEN comments come from REST with `created_at` THEN a real receipt counts", () => {
  const dir = project();
  const rest = (created_at, body) => ({ user: { login: "me" }, author_association: "MEMBER", created_at, body });
  const handoff = rest("2026-11-27T09:00:00Z", HANDOFF_10);
  assert.deepEqual(orphansOf(dir, [issue(18, [], [handoff, rest("2026-11-27T09:30:00Z", "Got it · docs thread · My reading: tidy it.")])]), [], "the receipt is after the record");
  const found = orphansOf(dir, [issue(18, [], [handoff])]);
  assert.deepEqual(kinds(found), [[18, "no-receipt"]]);
  assert.equal(found[0].since, Date.parse("2026-11-27T10:00:00Z"));
  // A labelled issue from REST with no check-by: due 2 hours after its created_at, not its updatedAt.
  const labelled = issue(19, ["handoff"], [], { created_at: "2026-11-27T09:00:00Z", body: "Handoff · a → b\n\nOwner's words: \"x\"" });
  assert.deepEqual(kinds(orphansOf(dir, [labelled])), [[19, "no-receipt"]]);
});

test("#397 item 4: WHEN a claim names a branch git accepts THEN a non-ASCII name is read, and a name this can't check isn't called invalid", () => {
  const dir = project();
  const git = (args, date) => execFileSync("git", ["-C", dir, ...args], { env: safeEnv({ GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }) });
  git(["checkout", "-q", "-b", "feat/23-café", "main"]);
  git(["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "#23"], "2026-11-27T09:00:00Z");
  git(["checkout", "-q", "main"]);
  assert.deepEqual(kinds(orphansOf(dir, [claimed(23, "feat/23-café")])), [[23, "stale-claim"]]);
  const [odd] = orphansOf(dir, [claimed(24, "feat/24-a+b")]);
  assert.equal(odd.kind, "unknown-branch");
  assert.doesNotMatch(odd.note, /isn't valid/);
});

test("#397 item 5: WHEN a fork's pull request is on a `feat/<n>-` branch THEN issue n's stale claim still shows", () => {
  const dir = project();
  const fork = (headRefName) => ({ number: 42, title: "From a fork", url: "https://github.com/acme/app/pull/42", headRefName, isCrossRepository: true, labels: [], isDraft: false, updatedAt: NOW });
  const stale = issue(7, ["status:in-progress"], [claimOn("feat/7-work", "2026-11-27T08:00:00Z"), gotIt("2026-11-27T08:05:00Z")]);
  for (const head of ["feat/7-work", "feat/7-other"]) assert.deepEqual(kinds(orphansOf(dir, [stale], { prs: [fork(head)] })), [[7, "stale-claim"]], head);
  assert.deepEqual(orphansOf(dir, [stale], { prs: [{ ...fork("feat/7-work"), isCrossRepository: false }] }), [], "this repo's own pull request");
});
