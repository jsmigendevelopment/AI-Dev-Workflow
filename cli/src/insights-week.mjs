#!/usr/bin/env node
// The weekly report (#381, part of #374): what a week of runs cost and why work went back, read from the insights
// records in docs/insights/<yyyy-mm-dd>/ (references/insights.md). It only reads: it writes no file and calls no API.
//   node insights-week.mjs [--week [<yyyy-Www>]] [--skip <yyyy-Www>] [dir]
//   npx onrails insights --week [<yyyy-Www>] [dir]
// The week is an ISO week in UTC; with none named it is last full week. --skip prints nothing when the week it would
// report is that one, so the loop sends each week once. dir defaults to the git repo it runs in, else this folder.
// It prints Markdown: runs per role and model, send-backs by reason, pull request size against send-backs,
// escalations, and usage per merged pull request. A number no record holds is `unknown`, never an estimate
// (decision 381-2). ONRAILS_NOW sets the clock (tests). Exit 2: a bad week or argument.
// This is the master copy: scripts/sync-skills.mjs copies it to the coordinate skill and to cli/src.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SIZE_LIMIT, validate } from "./insights-record.mjs";

const USAGE = "usage: insights-week.mjs [--week [<yyyy-Www>]] [--skip <yyyy-Www>] [dir]";
const REASONS = ["size", "review-must", "checks", "infra", "process"];
/** A verified failure, in routing's words: a failed check or a rejected review. */
const FAILURES = new Set(["review-must", "checks"]);
/** Who runs each job, from routing's role table. Any other job's role isn't on a record. */
const ROLES = { build: "builder", "review-code": "coordinator", "review-security": "coordinator", "size-check": "coordinator" };
/** The jobs whose records carry a usage reading (#380). */
const USAGE_JOBS = new Set(["build", "review-code", "review-security", "qa"]);
const WEEK = /^(\d{4})-W(\d{2})$/;
const DAY = 86400000;
const READING = /^(\d+(?:\.\d+)?)%$/;

/** The ISO week of a time, as yyyy-Www. */
function weekLabel(ms) {
  const d = new Date(ms);
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (3 - ((d.getUTCDay() + 6) % 7)) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  return `${year}-W${String(1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY))).padStart(2, "0")}`;
}

/** Monday 00:00 UTC of an ISO week, or null when there is no such week. */
function weekStart(label) {
  const m = WEEK.exec(label);
  if (!m) return null;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const start = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY + (Number(m[2]) - 1) * 7 * DAY;
  return weekLabel(start) === label ? start : null;
}

/** Every valid record under docs/insights/, and how many files in the week's day folders aren't one. */
function readRecords(root, start, end) {
  const base = join(root, "docs", "insights");
  let days;
  try {
    days = readdirSync(base, { withFileTypes: true }).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.name));
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return { records: [], skipped: 0 };
    throw e;
  }
  const records = [];
  let skipped = 0;
  for (const entry of days) {
    const day = entry.name;
    const inWeek = Date.parse(`${day}T00:00:00Z`) >= start && Date.parse(`${day}T00:00:00Z`) < end;
    // A stray file named like a day folder is skipped like any other file that isn't a record.
    if (!entry.isDirectory()) skipped += inWeek ? 1 : 0;
    else for (const name of readdirSync(join(base, day)).filter((n) => n.endsWith(".json"))) {
      let record;
      try { record = JSON.parse(readFileSync(join(base, day, name), "utf8")); } catch { record = null; } // not JSON: skipped
      if (record && validate(record).length === 0) records.push(record);
      else if (inWeek) skipped += 1;
    }
  }
  return { records: records.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), skipped };
}

/** Why a record sent work back: its send_back, or checks for the local gate's red run (decision 380-1). */
const reason = (r) => r.send_back ?? (r.kind === "check" && r.state === "failure" ? "checks" : undefined);
const ends = (r) => r.kind === "job" && r.outcome !== "started" && r.outcome !== "pr-opened";
const isUnknown = (r) => r.model === "unknown" || r.effort === "unknown";
const who = (r) => `${r.model} · ${r.effort}`;
const row = (cells) => `|${cells.map((c) => (c === "" ? " " : ` ${c} `)).join("|")}|`;
const table = (head, rows) => [row(head), `|${head.map(() => "---").join("|")}|`, ...rows.map(row)];
const ratio = (part, whole, f) => (whole ? f(part / whole) : "unknown");
const percent = (x) => `${Math.round(x * 100)}%`;

/** Counts by key, sorted by key: [[cells, count]]. */
function tally(items, cellsOf) {
  const counts = new Map();
  for (const item of items) {
    const key = JSON.stringify(cellsOf(item));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, n]) => [JSON.parse(key), n]);
}

function runs(week) {
  const rows = tally(week.filter(ends), (r) => [ROLES[r.job] ?? "unknown", r.job ?? "unknown", r.model, r.effort]);
  if (!rows.length) return ["## Runs per role and model", "", "No runs recorded this week."];
  return ["## Runs per role and model", "", ...table(["Role", "Job", "Model", "Effort", "Runs"], rows.map(([c, n]) => [...c, n])), "",
    "A run is a job record that ended (any outcome but `started` and `pr-opened`)."];
}

function sendBacks(ctx) {
  const builds = ctx.week.filter((r) => ends(r) && r.job === "build");
  const rows = new Map();
  const at = (model, effort) => {
    const key = JSON.stringify([model, effort]);
    if (!rows.has(key)) rows.set(key, { builds: 0, ...Object.fromEntries(REASONS.map((x) => [x, 0])) });
    return rows.get(key);
  };
  for (const b of builds) at(b.model, b.effort).builds += 1;
  for (const s of ctx.week.filter(reason)) {
    const b = ctx.lastBuild(s);
    at(b?.model ?? "unknown", b?.effort ?? "unknown")[reason(s)] += 1;
  }
  const line = (cells, c) => {
    const sent = REASONS.reduce((n, x) => n + c[x], 0);
    return [...cells, c.builds, ...REASONS.map((x) => c[x]), ratio(sent, c.builds, (x) => x.toFixed(2))];
  };
  const all = { builds: 0, ...Object.fromEntries(REASONS.map((x) => [x, 0])) };
  for (const c of rows.values()) for (const k of Object.keys(all)) all[k] += c[k];
  const body = [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([key, c]) => line(JSON.parse(key), c));
  return ["## Send-backs by reason", "", ...table(["Builder model", "Effort", "Builds", ...REASONS, "Per build"], [...body, line(["All", ""], all)]), "",
    "Each send-back, and each red local gate as checks, counts against the last build of its pull request or issue before it: unknown when there is none."];
}

/** The size buckets in the order they print: a label, and which counted lines belong in it. */
const BUCKETS = [["under 500", (n) => n < 500], ["500 to 999", (n) => n >= 500 && n < SIZE_LIMIT], ["1,000 or more", (n) => n >= SIZE_LIMIT]];

/** A pull request's size (#427): the counted lines on its last size check in the week, else undefined. */
const sizeOf = (week, pr) => week.filter((r) => r.pr === pr && r.lines !== undefined).at(-1)?.lines;

function sizes(ctx) {
  const prs = [...new Set(ctx.week.filter((r) => r.pr != null).map((r) => r.pr))];
  const back = new Set(ctx.week.filter((r) => reason(r) && r.pr != null).map((r) => r.pr));
  const big = [...new Set(ctx.week.filter((r) => r.send_back === "size" && r.pr != null).map((r) => r.pr))].sort((a, b) => a - b);
  const counted = new Map(prs.map((pr) => [pr, sizeOf(ctx.week, pr)]));
  const known = [...counted.values()].some((n) => n !== undefined);
  const line = (label, list) => {
    const sent = list.filter((pr) => back.has(pr)).length;
    return [label, list.length, sent, ratio(sent, list.length, percent)];
  };
  // No size on any record: every bucket stays unknown, and every pull request prints under unknown.
  const buckets = BUCKETS.map(([label, fits]) => (known ? line(label, prs.filter((pr) => counted.get(pr) !== undefined && fits(counted.get(pr))))
    : [label, "unknown", "unknown", "unknown"]));
  return ["## Pull request size against send-backs", "",
    ...table(["Size (counted lines)", "Pull requests", "Sent back", "Rate"],
      [...buckets, line("unknown", prs.filter((pr) => counted.get(pr) === undefined)), line("All sizes", prs)]), "",
    `Sent back for size (1,000 or more at that head): ${big.length ? big.map((n) => `#${n}`).join(", ") : "none"}.`,
    known ? "A pull request's size is the counted lines of its last size check in the week, from the `job=size-check` record that `pr-size.mjs --record` writes. unknown: no size record that week."
      : "The records hold no size check's count, so each bucket is unknown."];
}

/** How a build after a verified failure ended: the last later failure (no) or pass, green gate or merge (yes), else unknown. */
function fixedIt(ctx, b) {
  const passed = (r) => r.kind === "merge" || (r.kind === "review" && r.verdict === "pass") || (r.kind === "job" && r.outcome === "pass")
    || (r.kind === "check" && r.state === "success");
  // From the issue's next build on another model or effort, the records belong to that escalation's row. A build with
  // an unknown model or effort can't be told from a retry or from an escalation, so it ends no row: unknown (#431).
  const next = ctx.builds.find((n) => n.issue === b.issue && Date.parse(n.at) > Date.parse(b.at)
    && (who(n) !== who(b) || isUnknown(b) || isUnknown(n)));
  if (next && (isUnknown(b) || isUnknown(next))) return "unknown";
  const last = ctx.all.filter((r) => ctx.issueOf(r) === b.issue && Date.parse(r.at) > Date.parse(b.at)
    && (!next || Date.parse(r.at) < Date.parse(next.at)) && (FAILURES.has(reason(r)) || passed(r))).at(-1);
  return !last ? "unknown" : passed(last) ? "yes" : "no";
}

function escalations(ctx) {
  const count = { yes: 0, no: 0, unknown: 0 };
  const rows = [];
  for (const b of ctx.week.filter((r) => ends(r) && r.job === "build" && r.issue != null)) {
    const prev = ctx.builds.filter((p) => p.issue === b.issue && Date.parse(p.at) < Date.parse(b.at)).at(-1);
    const failed = prev && ctx.all.some((s) => FAILURES.has(reason(s)) && ctx.issueOf(s) === b.issue
      && Date.parse(s.at) >= Date.parse(prev.at) && Date.parse(s.at) < Date.parse(b.at));
    if (!failed) continue;
    const escalated = isUnknown(prev) || isUnknown(b) ? "unknown" : who(prev) === who(b) ? "no" : "yes";
    count[escalated] += 1;
    if (escalated !== "no") rows.push([`#${b.issue}`, who(prev), who(b), fixedIt(ctx, b)]);
  }
  const total = count.yes + count.no + count.unknown;
  return ["## Escalations", "",
    `Builds after a failed review or check: ${total}. Escalated: ${count.yes}. Not escalated: ${count.no}. Unknown: ${count.unknown}.`,
    ...(rows.length ? ["", ...table(["Issue", "From", "To", "Fixed it"], rows)] : []), "",
    "An escalation is any new model or effort on the next build of the issue. Fixed it, up to the next escalation: the last failed "
    + "review or check (no), or pass, green gate or merge (yes), else unknown. Unknown too when the next build of the issue, or this one, has an "
    + "unknown model or effort: it could be a retry or an escalation."];
}

/** Did the run cross its window's reset (#431)? A reset time inside the run, or two readings of different windows. Unknown or absent says nothing. */
function crossedReset(r) {
  const known = (w) => w !== undefined && w !== "unknown";
  if (known(r.usage_window_before) && known(r.usage_window_after) && r.usage_window_before !== r.usage_window_after) return true;
  const ended = Date.parse(r.ended ?? r.at);
  const end = Number.isNaN(ended) ? Date.parse(r.at) : ended;
  const start = Date.parse(r.started ?? "");
  // A reset at the start's own moment or before it was over before the run began; without a start, only the end counts.
  return [r.usage_resets_before, r.usage_resets_after].some((t) => {
    const reset = Date.parse(t ?? "");
    return reset <= end && (Number.isNaN(start) || reset > start);
  });
}

/** A run's usage: its after minus its before, when both are percentages and it didn't go down or cross a reset. Else null. */
function used(r) {
  const before = READING.exec(r.usage_before ?? "")?.[1];
  const after = READING.exec(r.usage_after ?? "")?.[1];
  const delta = Number(after) - Number(before);
  return before === undefined || after === undefined || delta < 0 || crossedReset(r) ? null : delta;
}

function usagePerMerge(ctx) {
  const merges = ctx.week.filter((r) => r.kind === "merge" && r.pr != null);
  if (!merges.length) return ["## Usage per merged pull request", "", "No merge records this week, so the usage per merged pull request is unknown."];
  const rows = merges.map((m) => {
    const issue = ctx.issueOf(m);
    const mine = ctx.all.filter((r) => ends(r) && USAGE_JOBS.has(r.job) && Date.parse(r.at) <= Date.parse(m.at)
      && (r.pr === m.pr || (issue != null && r.issue === issue)));
    const read = mine.map(used).filter((x) => x !== null);
    // Two tools are two plans, whose percentages don't add up; a run with no tool may be on either.
    const oneTool = new Set(mine.map((r) => r.tool)).size === 1 && (mine.length === 1 || mine.every((r) => r.tool));
    const total = oneTool && read.length === mine.length ? `${Number(read.reduce((a, b) => a + b, 0).toFixed(2))}%` : "unknown";
    return [`#${m.pr}`, mine.length, read.length, total];
  });
  return ["## Usage per merged pull request", "", ...table(["Pull request", "Runs", "With a reading", "Plan usage seen"], rows), "",
    "Plan usage seen while its runs ran: each run's after minus its before, in percent, not a cost. It includes anything that ran "
    + "beside them. A run that crossed its window's reset (a recorded reset time inside the run, or readings of two windows) has no usage seen: "
    + "after a reset it would read low. Runs on different or unrecorded tools, or one without both readings: unknown."];
}

/** The report for the week starting at `start` (ms), as Markdown. */
function weeklyReport(records, skipped, label, start) {
  const end = start + 7 * DAY;
  const week = records.filter((r) => Date.parse(r.at) >= start && Date.parse(r.at) < end);
  const prIssue = new Map(records.filter((r) => r.pr != null && r.issue != null).map((r) => [r.pr, r.issue]));
  const builds = records.filter((r) => ends(r) && r.job === "build");
  const issueOf = (r) => r.issue ?? prIssue.get(r.pr) ?? null;
  const lastBuild = (s) => builds.filter((b) => Date.parse(b.at) <= Date.parse(s.at)
    && ((s.pr != null && b.pr === s.pr) || (issueOf(s) != null && b.issue === issueOf(s)))).at(-1);
  const ctx = { all: records, week, builds, issueOf, lastBuild };
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const skip = skipped ? ` ${skipped} ${skipped === 1 ? "file" : "files"} skipped: not a valid record.` : "";
  return [`# Weekly report · ${label}`, "", `${day(start)} to ${day(end - DAY)} (UTC). ${week.length} records this week.${skip}`, "",
    ...runs(week), "", ...sendBacks(ctx), "", ...sizes(ctx), "", ...escalations(ctx), "", ...usagePerMerge(ctx), ""].join("\n");
}

function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return process.cwd(); // Not in a git repo: read this folder's docs/insights/.
  }
}

/** Runs the report from command-line arguments; returns the exit code. */
export function main(argv) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--week") opts.week = /^\d{4}-/.test(argv[i + 1] ?? "") ? argv[++i] : null;
    else if (argv[i] === "--skip") opts.skip = argv[++i] ?? "";
    else if (argv[i].startsWith("-") || rest.length) return process.stderr.write(`${USAGE}\n`), 2;
    else rest.push(argv[i]);
  }
  const now = process.env.ONRAILS_NOW ? Date.parse(process.env.ONRAILS_NOW) : Date.now();
  if (Number.isNaN(now)) return process.stderr.write("insights-week: ONRAILS_NOW isn't a time\n"), 2;
  const label = opts.week ?? weekLabel(now - 7 * DAY);
  const start = weekStart(label);
  // --skip none: no week was reported yet, so this one is due.
  if (start === null || (opts.skip !== undefined && opts.skip !== "none" && weekStart(opts.skip) === null)) {
    return process.stderr.write(`insights-week: a week is yyyy-Www, such as 2026-W48, and must exist. ${USAGE}\n`), 2;
  }
  if (opts.skip === label) return 0;
  const { records, skipped } = readRecords(rest[0] ? resolve(rest[0]) : repoRoot(), start, start + 7 * DAY);
  process.stdout.write(weeklyReport(records, skipped, label, start));
  return 0;
}

/** True when node started this file, also through a symlinked file or folder: import.meta.url is the real path, so
 * argv[1] is resolved to its real path too (#506, as in pr-size.mjs, #439). */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false; // An argv[1] that names no file (a REPL, a loader's stand-in) isn't this module.
  }
}

if (isMainModule()) process.exitCode = main(process.argv.slice(2));
