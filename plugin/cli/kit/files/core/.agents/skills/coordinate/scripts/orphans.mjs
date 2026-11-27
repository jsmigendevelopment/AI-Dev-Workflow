#!/usr/bin/env node
// The orphan sweep (../../ask/references/handoffs.md) from the lists the sweep already fetched. It makes no API calls.
//   node orphans.mjs --github <issues.json> [--github <prs.json>] [--json]
// The issue list needs `comments,body,createdAt` (board.md, "Render"). It finds:
//   - a handoff record (a `Handoff ·` comment or issue body, labelled or not, or a `Claimed by` comment) with no
//     `Got it ·` receipt after it, once past its "check by" time, or 2 hours after it when it names none;
//   - a stale claim: a `status:in-progress` issue whose claimed branch has no open pull request and no commit
//     (local git, so fetch first) or claim in the last 2 hours.
// ONRAILS_NOW sets the clock, for tests.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOURS_2 = 2 * 3600e3;
const RECORD = /^(Handoff ·|Claimed by )/;
const RECEIPT = /^Got it ·/;
const CHECK_BY = /check by (\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/i;
const BRANCH = /· branch `?([^\s`]+)`?/;

const labelsOf = (row) => (row.labels || []).map((l) => (typeof l === "string" ? l : l.name));
const time = (ts) => Date.parse(ts) || 0;
/** "2026-11-27 09:00 UTC" for a time in ms. */
export const utc = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** The handoff records on one issue: its body when it is one, and each record comment, oldest first. */
function records(row) {
  const out = [];
  const body = String(row.body || "");
  if (labelsOf(row).includes("handoff") || /^Handoff ·/m.test(body)) out.push({ at: time(row.createdAt || row.updatedAt), text: body });
  for (const c of row.comments || []) if (RECORD.test(String(c.body || "").trimStart())) out.push({ at: time(c.createdAt), text: c.body });
  return out;
}

/** When a record with no receipt starts to count: its "check by" time, or 2 hours after it. */
function deadline(record) {
  const m = String(record.text).match(CHECK_BY);
  return m ? time(`${m[1]}T${m[2]}:00Z`) : record.at + HOURS_2;
}

function lastCommit(branch, cwd) {
  for (const ref of [`origin/${branch}`, branch]) {
    try {
      const out = execFileSync("git", ["log", "-1", "--format=%cI", ref, "--"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (out) return time(out);
    } catch {
      // No such ref here: try the next one, else the claim's own time counts.
    }
  }
  return 0;
}

/** Every orphan in the open issues and pull requests: { issue, kind, since, note }, by issue number. */
export function findOrphans({ issues = [], prs = [], now = Date.now(), cwd = process.cwd() }) {
  const inReview = new Set(prs.map((p) => p.headRefName));
  const out = [];
  for (const row of issues) {
    const receipts = (row.comments || []).filter((c) => RECEIPT.test(String(c.body || "").trimStart())).map((c) => time(c.createdAt));
    const missing = records(row).filter((r) => !receipts.some((t) => t > r.at)).map(deadline).filter((d) => now > d);
    if (missing.length) {
      const since = Math.min(...missing);
      out.push({ issue: row.number, kind: "no-receipt", since, note: `no \`Got it ·\` receipt · past its check by, ${utc(since)}` });
    }
    const claim = (row.comments || []).filter((c) => String(c.body || "").startsWith("Claimed by ")).at(-1);
    const branch = claim?.body.match(BRANCH)?.[1];
    if (!labelsOf(row).includes("status:in-progress") || !branch || inReview.has(branch)) continue;
    const last = Math.max(time(claim.createdAt), lastCommit(branch, cwd));
    if (now - last > HOURS_2) out.push({ issue: row.number, kind: "stale-claim", since: last, note: `stale claim · branch ${branch} · no commit since ${utc(last)}` });
  }
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
