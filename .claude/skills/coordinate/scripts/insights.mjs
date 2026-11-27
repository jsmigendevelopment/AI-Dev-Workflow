#!/usr/bin/env node
// The insights writer (#329, part of #281): every insights event goes through here, so every record has one format.
//   node insights.mjs write <kind> key=value ...   writes docs/insights/<UTC yyyy-mm-dd>/<hhmm>-<kind>-<n>-<id>.json
//                                                  in the git root and prints its path. Commit it with the work.
//   node insights.mjs line <kind> key=value ...    prints <!-- onrails-insights {json} --> for a session that commits
//                                                  nothing (a reviewer): put it at the end of the verdict comment.
// model and effort are what the caller passes from its own session, else "unknown". ONRAILS_NOW sets the clock (tests).
// Exit 2: an unknown kind, a missing field or a bad value, with the field named; nothing is written.
// Exit 1: the write failed for another reason. It never invents a value.
//
// The coordinator carries records to main (#332), from its own checkout of main:
//   harvest --pr <n> --repo <owner>/<name>   writes each valid insights line from the pull request's comments that
//       isn't on disk yet. Only comments by gh's own login, or a login under [insights] writers in docs/profile.toml,
//       count. A line that fails validate, names another pull request or can't be a record file is skipped and named.
//       A record's id is a hash of it, so a rerun writes nothing; a different file on that name is named and kept.
//   land [--verify <pr>] [--repo <owner>/<name>]   lands the records on main: insights-land.mjs says how.
// harvest and land exit 2 on a usage, git or API error.
//
// The merge step's record check (#333), after a harvest, in the same checkout:
//   has-records --pr <n> --sha <sha>   exit 0 when docs/insights/ holds a valid job, check and review record whose pr
//       is <n> and whose sha is <sha>. Exit 1 names each missing kind and the job that makes it. Exit 2: a usage error.
//       It reads files only: no git, no API. Not `land --verify`, which checks a records-only pull request.
// Format and kinds: references/insights.md. Plain Node 22, no dependencies.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pages } from "./agent-files.mjs";
import { canonical, land, ownLogin, recordProblem } from "./insights-land.mjs";
import { KINDS, VERSION, coerce, dayFolder, fileName, parseLine, toLine, validate } from "./insights-record.mjs";

const USAGE = "usage: insights.mjs write|line <kind> key=value ... | harvest --pr <n> --repo <owner>/<name> | land [--verify <pr>] [--repo <owner>/<name>] | has-records --pr <n> --sha <sha>";
const LINE = /<!-- onrails-insights (.*?) -->/g;

function fail(code, message) {
  process.stderr.write(`insights: ${message}\n`);
  process.exit(code);
}
const warn = (message) => process.stderr.write(`insights: ${message}\n`);
const flag = (args, name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

function gitRoot() {
  const start = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: start, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fail(1, `${start} isn't in a git repo, so there's no docs/insights/ to write to`);
  }
}

function build(kind, pairs) {
  if (!Object.hasOwn(KINDS, kind)) fail(2, `kind: "${kind}" isn't one of ${Object.keys(KINDS).join(", ")}`);
  const at = new Date(process.env.ONRAILS_NOW || Date.now());
  if (Number.isNaN(at.getTime())) fail(2, "at: ONRAILS_NOW isn't a time");
  const record = { v: VERSION, kind, at: at.toISOString(), issue: null, pr: null, sha: null, job: null, tool: null, model: "unknown", effort: "unknown" };
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 1) fail(2, `"${pair}" isn't key=value`);
    const name = pair.slice(0, eq);
    if (["v", "kind", "at"].includes(name)) fail(2, `${name}: set by the writer, not passed`);
    try { record[name] = coerce(kind, name, pair.slice(eq + 1)); } catch (e) { fail(2, e.message); }
  }
  const errors = validate(record);
  if (errors.length) fail(2, errors.join("; "));
  return record;
}

function writeOrLine(cmd, kind, pairs) {
  if (!kind) fail(2, `kind: missing. ${USAGE}`);
  const record = build(kind, pairs);
  if (cmd === "line") return process.stdout.write(`${toLine(record)}\n`);
  const dir = join(gitRoot(), dayFolder(record));
  const path = join(dir, fileName(record));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, canonical(record), { flag: "wx" });
  } catch (e) {
    fail(1, `couldn't write ${path}: ${e.code || e.message}`);
  }
  return process.stdout.write(`${path}\n`);
}

/** The logins under [insights] writers = ["a", "b"] in docs/profile.toml, lower case. The list may span lines. */
function listedWriters(root) {
  let text;
  try { text = readFileSync(join(root, "docs", "profile.toml"), "utf8"); } catch { return []; }
  // A login holds no "#", so a "#" starts a TOML comment wherever it is.
  const body = (text.split(/^\[insights\]\s*$/m)[1]?.split(/^\[/m)[0] ?? "").replace(/#[^\n]*/g, "");
  const list = body.match(/^\s*writers\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
}

function lineProblem(json) {
  try { return validate(JSON.parse(json)).join("; "); } catch { return "isn't JSON"; }
}

/**
 * Writes the record unless its day folder already holds it. Returns { path } when written, { why } when it can't be
 * (not a record file land would take, or a different file on its name), or {} when it was already there.
 */
function keep(root, record) {
  const text = canonical(record);
  const rel = `${dayFolder(record)}/${fileName(record, createHash("sha256").update(text).digest("hex").slice(0, 6))}`;
  const problem = recordProblem(rel, Buffer.from(text));
  if (problem) return { why: `${rel}: ${problem}` };
  const day = join(root, dayFolder(record));
  mkdirSync(day, { recursive: true });
  const held = (name) => { try { return canonical(JSON.parse(readFileSync(join(day, name), "utf8"))) === text; } catch { return false; } };
  if (readdirSync(day).some(held)) return {};
  try {
    writeFileSync(join(root, rel), text, { flag: "wx" });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return { why: `${rel}: a different file already has this name; left as it is` };
  }
  return { path: join(root, rel) };
}

/** Why a parsed, valid record from #pr's comments can't be kept, or what keep() says. */
function harvestOne(root, record, pr) {
  if (record.pr != null && record.pr !== Number(pr)) return { why: `pr: ${record.pr} isn't #${pr}` };
  return keep(root, record);
}

function harvest(args) {
  const pr = flag(args, "--pr");
  const repo = flag(args, "--repo");
  if (!/^\d+$/.test(pr ?? "") || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) fail(2, "usage: insights.mjs harvest --pr <n> --repo <owner>/<name>");
  const root = gitRoot();
  const trusted = new Set([ownLogin().toLowerCase(), ...listedWriters(root)]);
  for (const c of pages(`repos/${repo}/issues/${pr}/comments`)) {
    const lines = [...String(c.body ?? "").matchAll(LINE)];
    const login = String(c.user?.login ?? "");
    if (!lines.length) continue;
    if (!trusted.has(login.toLowerCase())) {
      warn(`skipped comment ${c.id} by ${login}: not gh's own login or under [insights] writers`);
      continue;
    }
    for (const [line, json] of lines) {
      const record = parseLine(line);
      const kept = record ? harvestOne(root, record, pr) : { why: lineProblem(json) };
      if (kept.why) warn(`skipped a line in comment ${c.id} by ${login}: ${kept.why}`);
      if (kept.path) process.stdout.write(`${kept.path}\n`);
    }
  }
}

/** The kinds the merge step needs for a head, and the job that makes each one again. */
const NEEDED = {
  job: "send this sha to a fresh pr-review: its verdict comment carries the job line. Then harvest",
  check: "run the local gate (coordinate step 6.1) on this sha again: mark-check.mjs --record writes it",
  review: "send this sha to a fresh pr-review: its verdict comment carries the review line. Then harvest",
};

/** Every valid record under root's docs/insights/<day>/. A file that isn't one is left out: it proves nothing. */
function onDisk(root) {
  const top = join(root, "docs", "insights");
  const days = existsSync(top) ? readdirSync(top).filter((d) => lstatSync(join(top, d)).isDirectory()) : [];
  return days.flatMap((day) => readdirSync(join(top, day)).flatMap((name) => {
    const path = join(top, day, name);
    if (!name.endsWith(".json") || !lstatSync(path).isFile()) return [];
    try {
      const record = JSON.parse(readFileSync(path, "utf8"));
      return validate(record).length ? [] : [record];
    } catch {
      return [];
    }
  }));
}

function hasRecords(args) {
  const pr = flag(args, "--pr");
  const sha = flag(args, "--sha");
  if (!/^\d+$/.test(pr ?? "") || !/^[0-9a-f]{40}$/.test(sha ?? "")) fail(2, "usage: insights.mjs has-records --pr <n> --sha <sha> (the full 40-character head sha)");
  const found = new Set(onDisk(gitRoot()).filter((r) => r.pr === Number(pr) && r.sha === sha).map((r) => r.kind));
  const missing = Object.keys(NEEDED).filter((kind) => !found.has(kind));
  if (!missing.length) return process.stdout.write(`#${pr} @ ${sha}: job, check and review records found\n`);
  for (const kind of missing) warn(`#${pr} @ ${sha}: no ${kind} record. ${NEEDED[kind]}.`);
  return fail(1, `don't merge #${pr} yet. Never write a missing record by hand: run the job that makes it, then this again.`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "write" || cmd === "line") writeOrLine(cmd, rest[0], rest.slice(1));
else if (cmd === "has-records") hasRecords(rest);
else if (cmd === "harvest" || cmd === "land") {
  try {
    if (cmd === "harvest") harvest(rest);
    else land(gitRoot(), rest);
  } catch (e) {
    fail(2, String(e.stderr || e.message).trim());
  }
} else fail(2, USAGE);
