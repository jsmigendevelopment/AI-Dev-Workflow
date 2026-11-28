#!/usr/bin/env node
// The insights writer (#329, part of #281): every insights event goes through here, so every record has one format.
//   node insights.mjs write <kind> key=value ...   writes docs/insights/<UTC yyyy-mm-dd>/<hhmm>-<kind>-<n>-<id>.json
//                                                  in the git root and prints its path. Commit it with the work.
//   node insights.mjs line <kind> key=value ...    prints <!-- onrails-insights {json} --> for a session that commits
//                                                  nothing (a reviewer): put it at the end of the verdict comment.
//                                                  A job's line is followed by its run line (#129): job, model,
//                                                  effort, time from started= and the commit, for people to read.
// model and effort are what the caller passes from its own session, else "unknown". ONRAILS_NOW sets the clock (tests).
// Exit 2: an unknown kind, a missing field or a bad value, with the field named; nothing is written.
// Exit 1: the write failed for another reason. It never invents a value.
//   write ask answered=<the first ask's file name>   an answer record (#334): waited_minutes counts from the first
//       record's at, and its rule, level, issue, pr and title are copied unless passed. notify.mjs writes the first.
//
// The coordinator carries records to main (#332), from its own checkout of main:
//   harvest --pr <n> --repo <owner>/<name>   writes each valid insights line from the pull request's comments that
//       isn't on disk yet. Only comments by gh's own account, or an account listed as "login:id" under [insights]
//       writers in docs/profile.toml, count, by the numeric user ID (#408): a comment whose login matches but whose ID
//       doesn't is skipped and named. A line that fails validate, names another pull request or can't be a record
//       file is skipped and named. A `check` line counts only from a comment that reports the run (#441): its first
//       line is `Checks: pass|fail @ <sha>`, or `Code review: approve|request changes @ <sha>` with one such line
//       later (the reviewer's verdict comment), the sha is the record's and pass or fail fits its state.
//       A record's id is a hash of it, so a rerun writes nothing; a different file on that name is named and kept.
//   land [--verify <pr>] [--repo <owner>/<name>]   lands the records on main: insights-land.mjs says how.
// harvest and land exit 2 on a usage, git or API error.
//
// The merge step's records (#333), after a harvest, in the same checkout:
//   has-records --pr <n> --sha <sha>   exit 0 when docs/insights/ holds a job, a check and a review record whose pr
//       is <n> and whose sha is <sha>, each a file land would land as it is; board records don't count. Presence, not
//       pass: the verdicts are the Checks: comment's and the review's. Exit 1 names each missing kind and the job
//       that makes it. Exit 2: a usage error, or a checkout it can't read. It writes nothing and calls no API; its
//       only git call finds the checkout. Not `land --verify`, which checks a records-only pull request.
//   has-records --issue <n> --sha <sha>   local mode's form (#415): no pull request, so the records match on their
//       issue and sha instead of pr. Same rule, same exits; its hints don't send you to harvest.
//   carry --pr <n> --from <reviewed sha> --to <merge sha>   carries a review across a clean merge of main:
//       insights-carry.mjs says how.
// Format and kinds: references/insights.md. Plain Node 22, no dependencies.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pages } from "./agent-files.mjs";
import { carry, heldRecords, save } from "./insights-carry.mjs";
import { canonical, land, ownAccount, recordProblem } from "./insights-land.mjs";
import { ASK_FILE, KINDS, LINE_START, VERSION, coerce, dayFolder, fileName, parseLine, runLine, toLine, validate } from "./insights-record.mjs";

const USAGE = "usage: insights.mjs write|line <kind> key=value ... | harvest --pr <n> --repo <owner>/<name> | land [--verify <pr>] [--repo <owner>/<name>] | has-records --pr <n> --sha <sha> | has-records --issue <n> --sha <sha> | carry --pr <n> --from <sha> --to <sha>";
// [^\r\n], not ".": a dot stops at U+2028 and U+2029, so a valid line holding one was skipped without a word (#424).
const LINE = /<!-- onrails-insights ([^\r\n]*?) -->/g;

function fail(code, message) {
  process.stderr.write(`insights: ${message}\n`);
  process.exit(code);
}
const warn = (message) => process.stderr.write(`insights: ${message}\n`);
const flag = (args, name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

/** The checkout's root. Not in one: exit `code` (2 for a command that only reads, as no record can be missing). */
function gitRoot(code = 1) {
  const start = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: start, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fail(code, `${start} isn't in a git repo, so there's no docs/insights/ here`);
  }
}

function build(kind, pairs) {
  if (!Object.hasOwn(KINDS, kind)) fail(2, `kind: "${kind}" isn't one of ${Object.keys(KINDS).join(", ")}`);
  const at = new Date(process.env.ONRAILS_NOW || Date.now());
  if (Number.isNaN(at.getTime())) fail(2, "at: ONRAILS_NOW isn't a time");
  const record = { v: VERSION, kind, at: at.toISOString(), issue: null, pr: null, sha: null, job: null, tool: null, model: "unknown", effort: "unknown" };
  const passed = new Set();
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 1) fail(2, `"${pair}" isn't key=value`);
    const name = pair.slice(0, eq);
    if (["v", "kind", "at"].includes(name)) fail(2, `${name}: set by the writer, not passed`);
    try { record[name] = coerce(kind, name, pair.slice(eq + 1)); } catch (e) { fail(2, e.message); }
    passed.add(name);
  }
  if (kind === "ask" && passed.has("answered")) answer(record, passed);
  const errors = validate(record);
  if (errors.length) fail(2, errors.join("; "));
  return record;
}

/** The valid ask record called `name` in a day folder of docs/insights/, or exit 2 naming it. */
function askRecord(root, name) {
  const top = join(root, "docs", "insights");
  for (const day of existsSync(top) ? readdirSync(top) : []) {
    const rel = `docs/insights/${day}/${name}`;
    if (!existsSync(join(root, rel)) || !lstatSync(join(root, rel)).isFile()) continue;
    const bytes = readFileSync(join(root, rel));
    if (recordProblem(rel, bytes)) continue;
    const record = JSON.parse(bytes.toString("utf8"));
    if (record.kind === "ask") return record;
  }
  return fail(2, `answered: no valid ask record called ${name} in docs/insights/`);
}

/**
 * An answer to an ask (#334): waited_minutes from the first record's at, and its rule, level, issue, pr and title
 * unless passed, so the two records name the same stop. The writer counts the wait; nobody passes it.
 */
function answer(record, passed) {
  if (passed.has("waited_minutes")) fail(2, "waited_minutes: set by the writer from answered, not passed");
  // A name that isn't an ask file is never looked up: validate names it.
  if (!ASK_FILE.test(record.answered)) return;
  const first = askRecord(gitRoot(), record.answered);
  if (first.answered !== undefined) fail(2, `answered: ${record.answered} is itself an answer; name the first ask`);
  const ms = Date.parse(record.at) - Date.parse(first.at);
  if (ms < 0) fail(2, `answered: ${record.answered} is at ${first.at}, after this answer`);
  for (const name of ["issue", "pr", "rule", "level", "title", "full_should_prevent", "rule_ok"]) {
    if (!passed.has(name) && first[name] !== undefined) record[name] = first[name];
  }
  record.waited_minutes = Math.round(ms / 60000);
}

function writeOrLine(cmd, kind, pairs) {
  if (!kind) fail(2, `kind: missing. ${USAGE}`);
  const record = build(kind, pairs);
  // A job's line ends with the run line people read on GitHub (#129); the comment above it is what harvest reads.
  if (cmd === "line") return process.stdout.write(`${toLine(record)}\n${kind === "job" ? `Run: ${runLine(record)}\n` : ""}`);
  const root = gitRoot();
  try {
    return process.stdout.write(`${save(root, record)}\n`);
  } catch (e) {
    return fail(1, `couldn't write in ${join(root, dayFolder(record))}: ${e.code || e.message}`);
  }
}

/**
 * The accounts harvest trusts (#408): gh's own, then each "login:id" under [insights] writers = ["a:1", "b:2"] in
 * docs/profile.toml (the list may span lines). Trust is by the numeric user ID, which a rename or a recycled login
 * can't take over; the login is only a label for the warnings. An entry with no ID is named and not trusted.
 */
function trustedAccounts(root) {
  const me = ownAccount();
  const accounts = [{ login: me.login.toLowerCase(), id: me.id, name: "gh's own login" }];
  let text;
  try { text = readFileSync(join(root, "docs", "profile.toml"), "utf8"); } catch { return accounts; }
  // A login holds no "#", so a "#" starts a TOML comment wherever it is.
  const body = (text.split(/^\[insights\]\s*$/m)[1]?.split(/^\[/m)[0] ?? "").replace(/#[^\n]*/g, "");
  const list = body.match(/^\s*writers\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
  for (const [, entry] of list.matchAll(/"([^"]+)"/g)) {
    const pinned = /^([\w.-]+):(\d{1,15})$/.exec(entry);
    if (pinned) accounts.push({ login: pinned[1].toLowerCase(), id: Number(pinned[2]), name: "a writer" });
    else {
      const login = /^[\w.-]+$/.test(entry) ? entry : "<login>";
      warn(`writers entry ${JSON.stringify(entry)} has no user ID, so it isn't trusted. List it as "${login}:<id>"; gh api users/${login} --jq .id gives the ID.`);
    }
  }
  return accounts;
}

/** Why a comment's author isn't one of `accounts`, or null when its user ID is. */
function distrust(accounts, login, id) {
  if (!Number.isSafeInteger(id)) return "its author has no user ID";
  if (accounts.some((a) => a.id === id)) return null;
  const same = accounts.find((a) => a.login === login.toLowerCase());
  return same ? `the login matches ${same.name}, but its user ID ${id} isn't ${same.id}` : "not gh's own account or under [insights] writers";
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

// The two comments that report a run (#441). The merge helper's starts with the verdict. The reviewer's one verdict
// comment starts with `Code review: ...` and holds the verdict at the start of a later line (pr-review, "Verdict").
const VERDICT = /^Checks: (pass|fail) @ ([0-9a-f]{40})\s*$/;
const REVIEWED = /^Code review: (?:approve|request changes) @ ([0-9a-f]{40})\s*$/;

/**
 * Why a `check` record can't come from this comment, or null (#441). Builders, reviewers and the coordinator post as
 * one login, so the comment itself must say it reports the run: its verdict names the record's sha, and pass or fail
 * agrees with the record's state. A stray line elsewhere can't stand in for the run (#417).
 */
function checkProblem(body, record) {
  const lines = body.split(/\r?\n/);
  let verdict = VERDICT.exec(lines[0]);
  if (!verdict) {
    const reviewed = REVIEWED.exec(lines[0]);
    if (!reviewed) return "its comment doesn't start with `Checks: pass|fail @ <sha>` or `Code review: approve|request changes @ <sha>`";
    if (reviewed[1] !== record.sha) return `the comment reviews ${reviewed[1]}, not the record's ${record.sha}`;
    const found = lines.map((l) => VERDICT.exec(l)).filter(Boolean);
    if (found.length > 1) return "the comment has two or more Checks: lines, so which one covers this run is unclear";
    if (!found.length) return "the comment has no `Checks: pass|fail @ <sha>` line at the start of a line";
    [verdict] = found;
  }
  if (verdict[2] !== record.sha) return `its Checks: line names ${verdict[2]}, not the record's ${record.sha}`;
  const state = verdict[1] === "pass" ? "success" : "failure";
  return record.state === state ? null : `Checks: ${verdict[1]} doesn't match the record's state ${record.state}`;
}

/** Why a parsed, valid record from #pr's comment `body` can't be kept, or what keep() says. */
function harvestOne(root, record, pr, body) {
  if (record.pr != null && record.pr !== Number(pr)) return { why: `pr: ${record.pr} isn't #${pr}` };
  const problem = record.kind === "check" ? checkProblem(body, record) : null;
  return problem ? { why: `check line: ${problem}` } : keep(root, record);
}

function harvest(args) {
  const pr = flag(args, "--pr");
  const repo = flag(args, "--repo");
  if (!/^\d+$/.test(pr ?? "") || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) fail(2, "usage: insights.mjs harvest --pr <n> --repo <owner>/<name>");
  const root = gitRoot();
  const accounts = trustedAccounts(root);
  for (const c of pages(`repos/${repo}/issues/${pr}/comments`)) {
    const body = String(c.body ?? "");
    const lines = [...body.matchAll(LINE)];
    const opened = body.split(LINE_START).length - 1;
    const login = String(c.user?.login ?? "");
    if (!opened) continue;
    const untrusted = distrust(accounts, login, c.user?.id);
    if (untrusted) {
      warn(`skipped comment ${c.id} by ${login}: ${untrusted}`);
      continue;
    }
    if (opened > lines.length) warn(`skipped ${opened - lines.length} insights line(s) in comment ${c.id} by ${login}: opened but never closed with --> on the same line`);
    for (const [line, json] of lines) {
      const record = parseLine(line);
      const kept = record ? harvestOne(root, record, pr, body) : { why: lineProblem(json) };
      if (kept.why) warn(`skipped a line in comment ${c.id} by ${login}: ${kept.why}`);
      if (kept.path) process.stdout.write(`${kept.path}\n`);
    }
  }
}

/** The kinds the merge step needs for a head, and the job that makes each one again. */
const NEEDED = {
  job: "send this sha to a fresh pr-review: its verdict comment carries the job line",
  check: "run the local gate (coordinate step 6.1) on this sha again: mark-check.mjs --record writes it",
  review: "send this sha to a fresh pr-review: its verdict comment carries the review line",
};

function hasRecords(args) {
  const [pr, issue, sha] = [flag(args, "--pr"), flag(args, "--issue"), flag(args, "--sha")];
  const key = pr === undefined ? issue : pr;
  const usage = "usage: insights.mjs has-records --pr <n> --sha <sha> | has-records --issue <n> --sha <sha> (the full 40-character sha; --issue is local mode's, which has no pull request)";
  if (args.length !== 4 || (pr === undefined) === (issue === undefined) || !/^\d+$/.test(key ?? "") || !/^[0-9a-f]{40}$/.test(sha ?? "")) fail(2, usage);
  let held;
  try {
    held = heldRecords(gitRoot(2));
  } catch (e) {
    fail(2, `couldn't read docs/insights/ (${e.code || e.message}), so nothing was checked. Fix the checkout and run this again.`);
  }
  const target = pr === undefined ? `issue #${issue}` : `#${pr}`;
  const found = new Set(held.filter((r) => (pr === undefined ? r.issue === Number(issue) : r.pr === Number(pr)) && r.sha === sha).map((r) => r.kind));
  const missing = Object.keys(NEEDED).filter((kind) => !found.has(kind));
  if (!missing.length) return process.stdout.write(`${target} @ ${sha}: job, check and review records found\n`);
  // Local mode has no pull request to harvest from: its records are already files in this checkout.
  const then = pr === undefined ? "" : " Then harvest.";
  for (const kind of missing) warn(`${target} @ ${sha}: no ${kind} record. ${NEEDED[kind]}.${then}`);
  return fail(1, `don't merge ${target} yet. Never write a missing record by hand: run the job that makes it, then this again.`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "write" || cmd === "line") writeOrLine(cmd, rest[0], rest.slice(1));
else if (cmd === "has-records") hasRecords(rest);
else if (cmd === "harvest" || cmd === "land" || cmd === "carry") {
  try {
    if (cmd === "harvest") harvest(rest);
    else if (cmd === "carry") carry(rest);
    else land(gitRoot(), rest);
  } catch (e) {
    fail(2, String(e.stderr || e.message).trim());
  }
} else fail(2, USAGE);
