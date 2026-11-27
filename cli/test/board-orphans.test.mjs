// #112: the orphan sweep as a script. The board and `/back` list a stale claim and a handoff with no receipt from the
// issue list the sweep already fetched, with its comments. A missing receipt counts only past its "check by" time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const BOARD = join(REPO, ".agents/skills/coordinate/scripts/board.mjs");
const ORPHANS = join(REPO, ".agents/skills/coordinate/scripts/orphans.mjs");
const NOW = "2026-11-27T12:00:00Z";

const comment = (createdAt, body) => ({ author: { login: "me" }, createdAt, body });
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
