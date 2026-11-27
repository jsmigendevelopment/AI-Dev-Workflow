#!/usr/bin/env node
// The orphan sweep (../../ask/references/handoffs.md) from the lists the sweep already fetched. It makes no API calls.
//   node orphans.mjs --github <issues.json> [--github <prs.json>] [--json]
// The issue list needs `comments,body,createdAt` (board.md, "Render"). Only comments by the repo's OWNER, a MEMBER
// or a COLLABORATOR count. It finds:
//   - no-receipt: a handoff record (a `Handoff ·` comment, an issue labelled `handoff`, or a `Claimed by` comment)
//     with no `Got it ·` receipt after it, once past its "check by" time (UTC, Z, GMT or an offset such as +01:00),
//     or 2 hours after it when it names none, or one this can't read;
//   - stale-claim: a `status:in-progress` issue with no open pull request whose claimed branch has had no commit
//     and no claim for 2 hours. It reads the branch from local git, so run `git fetch origin --prune` first;
//   - unknown-branch: a claim 2 hours old whose branch has no local or `origin/` ref, or isn't a valid branch name.
//     Fetch and run again; never retake a claim on it.
// ONRAILS_NOW sets the clock, for tests.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOURS_2 = 2 * 3600e3;
const HANDOFF = /^Handoff ·/;
const CLAIM = /^Claimed by /;
const RECEIPT = /^Got it ·/;
const CHECK_BY = /check by (\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?\s*([^\s·]*)/i;
const BRANCH = /· branch `?([^\s`]+)`?/;
// Anyone can comment on a public repo. Only the repo's own people (and its agents, who use their login) count.
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

const labelsOf = (row) => (row.labels || []).map((l) => (typeof l === "string" ? l : l.name));
const time = (ts) => Date.parse(ts) || 0;
/** "2026-11-27 09:00 UTC" for a time in ms. */
export const utc = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
/** The issue a `feat/<n>-...` or `fix/<n>-...` branch is for, as the board reads it. */
export const issueFromBranch = (ref) => Number(String(ref || "").match(/^[\w-]+\/(\d+)[-_]/)?.[1]) || undefined;

/** The issue's comments by trusted authors (gh's authorAssociation, or the REST author_association). */
const comments = (row) => (row.comments || []).filter((c) => TRUSTED.has(String(c.authorAssociation ?? c.author_association ?? "").toUpperCase()));
/** One rule for every headline: the comment's first text, after any leading space. */
const headed = (c, re) => re.test(String(c.body || "").trimStart());

/** The handoff records on one issue: its body when it is labelled `handoff`, and each record comment. */
function records(row) {
  const out = labelsOf(row).includes("handoff") ? [{ at: time(row.createdAt || row.updatedAt), text: String(row.body || "") }] : [];
  for (const c of comments(row)) if (headed(c, HANDOFF) || headed(c, CLAIM)) out.push({ at: time(c.createdAt), text: c.body });
  return out;
}

/** The zone after a check-by time as minutes east of UTC, or null when it names none or one this can't read. */
function zoneOffset(token) {
  const t = token.replace(/[.,;:)]+$/, "");
  if (/^(UTC|GMT|Z)$/i.test(t)) return 0;
  const m = t.match(/^(?:UTC|GMT)?([+-])(\d{2}):?(\d{2})$/i);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}

/** The record's "check by" time in ms, or null when it has none that is a real time in a zone this reads. */
function checkBy(text) {
  const m = String(text).match(CHECK_BY);
  const offset = m && zoneOffset(m[6]);
  if (offset === null || offset === undefined) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi));
  // Date.UTC rolls 25:00 or 30 February over to the next day; a real time comes back unchanged.
  const real = at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d && at.getUTCHours() === h && at.getUTCMinutes() === mi;
  return real ? at.getTime() - offset * 60e3 : null;
}

/** A branch name from comment text that git may read: no leading dash, plain characters, and git's own check. */
function validBranch(name, cwd) {
  if (!name || name.startsWith("-") || !/^[\w./-]+$/.test(name)) return false;
  try {
    execFileSync("git", ["check-ref-format", "--branch", name], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false; // git refuses the name: it can't be a branch
  }
}

/** The branch's last commit time from `origin/` or a local branch, or null when neither ref exists here. */
function lastCommit(branch, cwd) {
  for (const ref of [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`]) {
    try {
      const out = execFileSync("git", ["log", "-1", "--format=%cI", "--end-of-options", ref, "--"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (out) return time(out);
    } catch {
      // No such ref here: try the next one.
    }
  }
  return null;
}

function noReceipt(row, now) {
  const receipts = comments(row).filter((c) => headed(c, RECEIPT)).map((c) => time(c.createdAt));
  const due = records(row).filter((r) => !receipts.some((t) => t > r.at)).map((r) => checkBy(r.text) ?? r.at + HOURS_2).filter((d) => now > d);
  if (!due.length) return null;
  const since = Math.min(...due);
  return { issue: row.number, kind: "no-receipt", since, note: `no \`Got it ·\` receipt · past its check by, ${utc(since)}` };
}

function claimOrphan(row, review, now, cwd) {
  const claim = comments(row).filter((c) => headed(c, CLAIM)).at(-1);
  if (!claim || !labelsOf(row).includes("status:in-progress") || review.issues.has(row.number)) return null;
  const branch = claim.body.match(BRANCH)?.[1];
  if (review.branches.has(branch)) return null;
  const claimedAt = time(claim.createdAt);
  const valid = validBranch(branch, cwd);
  const commit = valid ? lastCommit(branch, cwd) : null;
  if (commit === null) {
    if (now - claimedAt <= HOURS_2) return null; // a fresh claim may not be pushed yet
    const note = valid ? `claim · branch ${branch} not found here · fetch, then run again` : "claim · its branch name isn't valid · fix the claim";
    return { issue: row.number, kind: "unknown-branch", since: claimedAt, note };
  }
  const last = Math.max(claimedAt, commit);
  return now - last > HOURS_2 ? { issue: row.number, kind: "stale-claim", since: last, note: `stale claim · branch ${branch} · no commit since ${utc(last)}` } : null;
}

/** Every orphan in the open issues and pull requests: { issue, kind, since, note }, by issue number. */
export function findOrphans({ issues = [], prs = [], now = Date.now(), cwd = process.cwd() }) {
  const review = { branches: new Set(prs.map((p) => p.headRefName)), issues: new Set(prs.map((p) => issueFromBranch(p.headRefName)).filter(Boolean)) };
  const out = [];
  for (const row of issues) out.push(...[noReceipt(row, now), claimOrphan(row, review, now, cwd)].filter(Boolean));
  return out.sort((a, b) => a.issue - b.issue);
}

/** Issues and pull requests from --github files: gh list output, sorted by shape as board.mjs does. */
export function readLists(files) {
  const lists = { issues: [], prs: [] };
  for (const f of files) {
    const data = JSON.parse(readFileSync(f, "utf8"));
    for (const row of Array.isArray(data) ? data : [...(data.issues || []), ...(data.prs || [])]) {
      if (row.headRefName !== undefined) lists.prs.push(row);
      else lists.issues.push(row);
    }
  }
  return lists;
}

function main(argv) {
  const files = argv.flatMap((a, i) => (a === "--github" && argv[i + 1] ? [argv[i + 1]] : []));
  if (!files.length) {
    console.log("Usage: orphans.mjs --github <issues.json> [--github <prs.json>] [--json]");
    return 2;
  }
  const now = process.env.ONRAILS_NOW ? time(process.env.ONRAILS_NOW) : Date.now();
  const found = findOrphans({ ...readLists(files), now });
  if (argv.includes("--json")) console.log(JSON.stringify(found));
  else console.log(found.length ? found.map((o) => `#${o.issue} · ${o.note}`).join("\n") : "No orphans.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
