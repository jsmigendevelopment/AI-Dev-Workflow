#!/usr/bin/env node
// Which model did which job (#129): the job records in docs/insights/<yyyy-mm-dd>/ (references/insights.md), as one
// line per run, oldest first. It only reads: it writes no file and calls no API.
//   node insights-runs.mjs --pr <n> [--brief] [dir]    the pull request's chain: the build, reviews, QA, the merge
//   node insights-runs.mjs --issue <n> [dir]           the same chain, from the issue
//   node insights-runs.mjs --day <yyyy-mm-dd> [dir]    every run recorded that UTC day
//   npx onrails runs ...                               the same
// A pull request's chain also holds its issue's records with no pull request yet (the build's start), and an issue's
// holds its pull requests' records. --brief prints the /back line: each finished run's job, model, effort and time.
// A run's time is from its started= to its end, or for a build from its start record. A time no record gives is
// `unknown`, never a guess. Board records are left out. dir defaults to the git repo it runs in, else this folder.
// Exit 2: a bad argument. This is the master copy: scripts/sync-skills.mjs copies it to the coordinate skill and to cli/src.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { minutes, runLine, timeText, validate } from "./insights-record.mjs";

const USAGE = "usage: insights-runs.mjs --pr <n> [--brief] | --issue <n> | --day <yyyy-mm-dd> [dir]";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const time = (r) => Date.parse(r.at);

/** Every valid job record under docs/insights/ but the board's, oldest first, and per day folder how many files weren't a record. */
function readRuns(root) {
  const base = join(root, "docs", "insights");
  let days;
  try {
    days = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory() && DAY.test(d.name));
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return { runs: [], skipped: {} };
    throw e;
  }
  const runs = [];
  const skipped = {};
  for (const day of days) {
    for (const name of readdirSync(join(base, day.name)).filter((n) => n.endsWith(".json"))) {
      let record;
      try { record = JSON.parse(readFileSync(join(base, day.name, name), "utf8")); } catch { record = null; } // not JSON: skipped
      if (!record || validate(record).length) skipped[day.name] = (skipped[day.name] ?? 0) + 1;
      else if (record.kind === "job" && record.source !== "board") runs.push(record);
    }
  }
  return { runs: runs.sort((a, b) => time(a) - time(b)), skipped };
}

/** A run's minutes: its own started=, else, for an end with no started=, from the last start of its job and issue. */
function minutesOf(run, runs) {
  if (run.started !== undefined || run.outcome === "started" || run.issue == null) return minutes(run);
  const start = runs.filter((s) => s.outcome === "started" && s.job === run.job && s.issue === run.issue && time(s) <= time(run)).at(-1);
  return start ? minutes({ ...run, started: start.at }) : null;
}

/** The runs of a pull request or an issue, with the records that link the two. */
function chain(runs, by, n) {
  const other = by === "pr" ? "issue" : "pr";
  const linked = new Set(runs.filter((r) => r[by] === n && r[other] != null).map((r) => r[other]));
  return runs.filter((r) => r[by] === n || (linked.has(r[other]) && (by === "issue" || r.pr == null)));
}

const when = (r) => r.at.slice(0, 16).replace("T", " ");
const ends = (r) => r.outcome !== "started" && r.outcome !== "pr-opened";

function brief(n, picked, runs) {
  const done = picked.filter(ends).map((r) => {
    const mins = minutesOf(r, runs);
    return `${r.job ?? "unknown"} by ${r.model} at ${r.effort}, ${mins === null ? "unknown time" : timeText(mins)}`;
  });
  return `PR #${n}: ${done.length ? done.join("; ") : "no runs recorded"}\n`;
}

/** Reads the arguments: { by, value, brief, dir }, or null when they don't make one question. */
function parse(argv) {
  const opts = { brief: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--brief") opts.brief = true;
    else if (["--pr", "--issue", "--day"].includes(a) && !opts.by) [opts.by, opts.value] = [a.slice(2), argv[++i] ?? ""];
    else if (a.startsWith("-") || opts.dir) return null;
    else opts.dir = a;
  }
  const midnight = Date.parse(`${opts.value}T00:00:00Z`);
  const good = opts.by === "day" ? DAY.test(opts.value) && !Number.isNaN(midnight) && new Date(midnight).toISOString().startsWith(opts.value)
    : /^\d+$/.test(opts.value ?? "");
  return good && (!opts.brief || opts.by === "pr") ? opts : null;
}

function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return process.cwd(); // Not in a git repo: read this folder's docs/insights/.
  }
}

/** Prints the runs the arguments ask for; returns the exit code. */
export function main(argv) {
  const opts = parse(argv);
  if (!opts) return process.stderr.write(`${USAGE}\n`), 2;
  const { runs, skipped } = readRuns(opts.dir ? resolve(opts.dir) : repoRoot());
  const n = Number(opts.value);
  const picked = opts.by === "day" ? runs.filter((r) => r.at.startsWith(opts.value)) : chain(runs, opts.by, n);
  if (opts.brief) return process.stdout.write(brief(n, picked, runs)), 0;
  const head = opts.by === "day" ? `Runs on ${opts.value} (UTC).` : `Runs for ${opts.by === "pr" ? "" : "issue "}#${n}, oldest first (UTC).`;
  const bad = opts.by === "day" ? skipped[opts.value] ?? 0 : Object.values(skipped).reduce((a, b) => a + b, 0);
  const skip = bad ? ` ${bad} ${bad === 1 ? "file" : "files"} skipped: not a valid record.` : "";
  const lines = picked.map((r) => `${when(r)} · ${runLine(r, { mins: minutesOf(r, runs), outcome: true })}`);
  process.stdout.write(`${head}${skip}\n${lines.length ? lines.join("\n") : "No runs recorded."}\n`);
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
