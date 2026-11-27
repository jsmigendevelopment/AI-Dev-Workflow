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
//       count. A line that fails validate is skipped and named. A record's id is a hash of it, so a rerun writes nothing.
//   land [--repo <owner>/<name>]   pushes branch chore/insights-<yyyy-mm-dd>-<hhmm>, off origin/main with only the record
//       files not on origin/main, opens a pull request labelled no-issue and prints its number. Nothing pending: prints
//       nothing. It stages those files in the checkout, so the pull after the merge is clean.
//   land --verify <pr> [--repo <owner>/<name>]   the review of a records-only pull request (decision 332-1): exit 0
//       and the head sha only if gh's own login opened it from a chore/insights- branch of the repo and every changed
//       file is an added, valid record under docs/insights/. Exit 1 names each file that isn't.
// harvest and land exit 2 on a usage, git or API error.
// Format and kinds: references/insights.md. Plain Node 22, no dependencies.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gh, pages } from "./agent-files.mjs";
import { KINDS, VERSION, coerce, dayFolder, fileName, parseLine, toLine, validate } from "./insights-record.mjs";

const USAGE = "usage: insights.mjs write|line <kind> key=value ... | harvest --pr <n> --repo <owner>/<name> | land [--verify <pr>] [--repo <owner>/<name>]";
const BASE = "main";
const REPO = /^[\w.-]+\/[\w.-]+$/;
const RECORD_PATH = /^docs\/insights\/\d{4}-\d{2}-\d{2}\/[^/]+\.json$/;
const LINE = /<!-- onrails-insights (.*?) -->/g;
const CHORE = /^chore\/insights-\d{4}-\d{2}-\d{2}-\d{4}$/;

function fail(code, message) {
  process.stderr.write(`insights: ${message}\n`);
  process.exit(code);
}
const warn = (message) => process.stderr.write(`insights: ${message}\n`);
const flag = (args, name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const git = (root, args, env = process.env) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env }).trim();

function gitRoot() {
  const start = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: start, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fail(1, `${start} isn't in a git repo, so there's no docs/insights/ to write to`);
  }
}

function build(kind, pairs) {
  if (!KINDS[kind]) fail(2, `kind: "${kind}" isn't one of ${Object.keys(KINDS).join(", ")}`);
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
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  } catch (e) {
    fail(1, `couldn't write ${path}: ${e.code || e.message}`);
  }
  return process.stdout.write(`${path}\n`);
}

/** Why the file at `path` (from the repo root) isn't a valid record with the name the writer gives it, or null. */
function recordProblem(path, text) {
  if (!RECORD_PATH.test(path)) return "not a record file in docs/insights/<yyyy-mm-dd>/";
  let record;
  try { record = JSON.parse(text); } catch { return "isn't JSON"; }
  const errors = validate(record);
  if (errors.length) return errors.join("; ");
  const id = /-([0-9a-f]{6})\.json$/.exec(path)?.[1] ?? "<id>";
  const want = `${dayFolder(record)}/${fileName(record, id)}`;
  return want === path ? null : `its name doesn't match the record: want ${dayFolder(record)}/${fileName(record, "<id>")}`;
}

/** gh's own login: the coordinator's. */
function ownLogin() {
  const login = JSON.parse(gh("user")).login;
  if (typeof login !== "string" || !login) throw new Error("gh api user named no login");
  return login;
}

/** The logins under [insights] writers = ["a", "b"] in docs/profile.toml, lower case. */
function listedWriters(root) {
  let text;
  try { text = readFileSync(join(root, "docs", "profile.toml"), "utf8"); } catch { return []; }
  const body = text.split(/^\[insights\]\s*$/m)[1]?.split(/^\[/m)[0] ?? "";
  const list = body.match(/^\s*writers\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
}

function lineProblem(json) {
  try { return validate(JSON.parse(json)).join("; "); } catch { return "isn't JSON"; }
}

/** Writes the record unless its day folder already holds it, and returns the new file's path, or null. */
function keep(root, record) {
  const text = JSON.stringify(record);
  const day = join(root, dayFolder(record));
  const held = (name) => { try { return JSON.stringify(JSON.parse(readFileSync(join(day, name), "utf8"))) === text; } catch { return false; } };
  if (existsSync(day) && readdirSync(day).some(held)) return null;
  const path = join(day, fileName(record, createHash("sha256").update(text).digest("hex").slice(0, 6)));
  mkdirSync(day, { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  return path;
}

function harvest(args) {
  const pr = flag(args, "--pr");
  const repo = flag(args, "--repo");
  if (!/^\d+$/.test(pr ?? "") || !REPO.test(repo ?? "")) fail(2, "usage: insights.mjs harvest --pr <n> --repo <owner>/<name>");
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
      if (!record) warn(`skipped a line in comment ${c.id} by ${login}: ${lineProblem(json)}`);
      const path = record && keep(root, record);
      if (path) process.stdout.write(`${path}\n`);
    }
  }
}

/** Record files on disk that aren't on origin/main. An invalid one is named and left out. */
function pending(root) {
  const onMain = new Set(git(root, ["ls-tree", "-r", "--name-only", `origin/${BASE}`, "--", "docs/insights"]).split("\n"));
  const top = join(root, "docs", "insights");
  const files = [];
  for (const day of existsSync(top) ? readdirSync(top).sort() : []) {
    if (!lstatSync(join(top, day)).isDirectory()) continue;
    for (const name of readdirSync(join(top, day)).sort()) {
      const path = `docs/insights/${day}/${name}`;
      if (onMain.has(path) || !lstatSync(join(root, path)).isFile()) continue;
      const problem = recordProblem(path, readFileSync(join(root, path), "utf8"));
      if (problem) warn(`left out ${path}: ${problem}`);
      else files.push(path);
    }
  }
  return files;
}

/** One commit on origin/main that adds `files`, made in a temp index so the checkout's own index stays as it is. */
function commitOnMain(root, files) {
  const dir = mkdtempSync(join(tmpdir(), "onrails-insights-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, "index") };
    git(root, ["read-tree", `origin/${BASE}`], env);
    for (const path of files) {
      git(root, ["update-index", "--add", "--cacheinfo", `100644,${git(root, ["hash-object", "-w", "--", path])},${path}`], env);
    }
    const tree = git(root, ["write-tree"], env);
    return git(root, ["commit-tree", tree, "-p", `origin/${BASE}`, "-m", `Insights records: ${files.length} file(s), no issue`], env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function open(root, repo) {
  const files = pending(root);
  if (!files.length) return;
  const iso = new Date(process.env.ONRAILS_NOW || Date.now()).toISOString();
  const branch = `chore/insights-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  git(root, ["push", "-q", "origin", `${commitOnMain(root, files)}:refs/heads/${branch}`]);
  // Staged, an identical file the merge brings in doesn't stop `git pull --ff-only`; untracked, it would.
  git(root, ["add", "--", ...files]);
  const body = [
    `Records only, from \`insights.mjs land\`: ${files.length} file(s) under docs/insights/. Its review is \`insights.mjs land --verify\` (decision 332-1).`,
    "",
    ...files.map((f) => `- ${f}`),
  ].join("\n");
  const pull = JSON.parse(gh("-X", "POST", "-f", "title=Insights records (no issue)", "-f", `body=${body}`, "-f", `head=${branch}`, "-f", `base=${BASE}`, `repos/${repo}/pulls`));
  process.stdout.write(`${pull.number}\n`);
  gh("-X", "POST", "-f", "labels[]=no-issue", `repos/${repo}/issues/${pull.number}/labels`);
}

/** Each changed file between origin/main and sha as [path, why it isn't an added record]. Empty: all good. */
function badFiles(root, sha) {
  const parts = git(root, ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", `origin/${BASE}...${sha}`]).split("\0").filter(Boolean);
  if (!parts.length) return [["(none)", "it changes no file"]];
  const bad = [];
  for (let i = 0; i < parts.length; i += 2) {
    const [, mode, , blob, status] = parts[i].slice(1).split(" ");
    const path = parts[i + 1];
    let why = null;
    if (!path.startsWith("docs/insights/")) why = "outside docs/insights/";
    else if (status !== "A") why = `changed (${status}), not added`;
    else if (mode !== "100644") why = "not a plain file";
    else why = recordProblem(path, git(root, ["cat-file", "blob", blob]));
    if (why) bad.push([path, why]);
  }
  return bad;
}

function verify(root, repo, pr) {
  if (!/^\d+$/.test(pr ?? "")) fail(2, "usage: insights.mjs land --verify <pr> [--repo <owner>/<name>]");
  const pull = JSON.parse(gh(`repos/${repo}/pulls/${pr}`));
  const me = ownLogin();
  const ref = String(pull.head?.ref ?? "");
  const refuse = (why) => fail(1, `#${pr} isn't a records-only pull request: ${why}`);
  if (String(pull.user?.login).toLowerCase() !== me.toLowerCase()) refuse(`${pull.user?.login} opened it, not ${me}`);
  if (!CHORE.test(ref) || pull.head?.repo?.full_name !== repo) refuse(`${pull.head?.repo?.full_name}:${ref} isn't a chore/insights- branch of ${repo}`);
  if (pull.base?.ref !== BASE) refuse(`its base is ${pull.base?.ref}, not ${BASE}`);
  git(root, ["fetch", "-q", "origin", `refs/heads/${ref}`]);
  const sha = git(root, ["rev-parse", "FETCH_HEAD"]);
  if (sha !== pull.head.sha) fail(2, `#${pr}'s head moved: GitHub says ${pull.head.sha}, origin has ${sha}. Run it again.`);
  const bad = badFiles(root, sha);
  for (const [path, why] of bad) warn(`${path}: ${why}`);
  if (bad.length) refuse(`${bad.length} file(s) above`);
  process.stdout.write(`${sha}\n`);
}

function land(args) {
  const root = gitRoot();
  const origin = /github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(git(root, ["remote", "get-url", "origin"]))?.[1];
  const repo = flag(args, "--repo") ?? origin;
  if (!REPO.test(repo ?? "")) fail(2, "pass --repo <owner>/<name>: origin isn't a GitHub URL");
  git(root, ["fetch", "-q", "origin", BASE]);
  if (args.includes("--verify")) verify(root, repo, flag(args, "--verify"));
  else open(root, repo);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "write" || cmd === "line") writeOrLine(cmd, rest[0], rest.slice(1));
else if (cmd === "harvest" || cmd === "land") {
  try {
    if (cmd === "harvest") harvest(rest);
    else land(rest);
  } catch (e) {
    fail(2, String(e.stderr || e.message).trim());
  }
} else fail(2, USAGE);
