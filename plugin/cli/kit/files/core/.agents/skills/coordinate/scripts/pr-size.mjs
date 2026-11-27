#!/usr/bin/env node
// A pull request's size (#377, part of #374): one rule, which pr-rules.mjs (the local gate) and the web pack's
// `pnpm pr:rules` use too.
//   node pr-size.mjs <n> --repo <owner>/<name>   a pull request, read from GitHub's REST API
//   node pr-size.mjs --base <ref>                this checkout's committed branch against <ref>, such as origin/main
// It counts lines added plus removed. Lockfiles, test fixtures (data files in a fixtures folder under a test folder)
// and files the base's committed .gitattributes mark `linguist-generated` (the kit's synced copies, each pack's list)
// don't count. The base is <ref>, or the pull request's base commit, which must be in this checkout: the branch's own
// .gitattributes never decide what counts, and a local diff counts every text file as text, whatever they say. A
// rename is skipped only when its old and new names both are. It prints the total, the excluded total and the biggest
// counted files. 1,000 or more fails, unless the pull request has the `size-exception` label and a visible
// `Size exception: <reason>` line in its description. A local diff has no label, so it can't pass that way.
// Exit 0: under the limit, or an exception with its reason. 1: at or over it. 2: a usage, git or API error, or a count
// that isn't a whole number. Never a pass.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changedPaths, gh, pages, prArgs } from "./agent-files.mjs";

/** At this many counted lines or more, a pull request fails without an exception. */
export const MAX_CHANGED_LINES = 1000;
export const EXCEPTION_LABEL = "size-exception";
export const LOCKFILES = /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|deno\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|Podfile\.lock|pubspec\.lock|flake\.lock|mix\.lock|packages\.lock\.json|gradle\.lockfile)$/;
const TEST_DIRS = new Set(["test", "tests", "__tests__", "e2e", "spec"]);
const FIXTURE_DIRS = new Set(["fixture", "fixtures", "__fixtures__", "testdata", "__snapshots__"]);
// Source code never counts as a fixture, wherever it sits: a reviewer reads it.
const SOURCE = /\.(?:[cm]?[jt]sx?|py|go|rs|rb|java|kts?|swift|c|h|cc|cpp|hpp|cs|php|scala|sh|bash|ps1|vue|svelte|astro|sql|dart|exs?|lua|mm?)$/i;
const EXCEPTION = /^(?:[-*][ \t]+)?(?:\*\*)?Size exception:(?:\*\*)?[ \t]*(\S.*?)[ \t]*$/m;
const SAFE_REF = /^(?!-)[\w./@^~-]+$/;
const BIGGEST = 5;
const HERE = dirname(fileURLToPath(import.meta.url));

// git never gets a token, and starts nothing the checkout's config names: a command a pull request ran may have
// written that config. Its own variables go too, so none points it at another repo or config file. Paths match by
// case, as GitHub's do, even where `git init` sets core.ignorecase on a case-insensitive disk.
const UNSAFE_ENV = /TOKEN|SECRET|PASSWORD|API_KEY|^GIT_|^GH_|^GITHUB_/i;
const SAFE_GIT = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "core.attributesFile=/dev/null", "-c", "core.ignorecase=false"];

/** git with SAFE_GIT, no token, and no global or system config or attributes. Its output as text; throws when it fails.
 * `env` adds variables after the unsafe ones are dropped. */
function git(args, { cwd, input, env: extra = {} } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !UNSAFE_ENV.test(name)));
  const r = spawnSync("git", [...SAFE_GIT, ...args], {
    cwd, input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
    // GIT_CONFIG_NOSYSTEM doesn't cover $(prefix)/etc/gitattributes, which the user owns under Homebrew.
    env: { ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_ATTR_NOSYSTEM: "1", ...extra },
  });
  if (r.status !== 0) throw new Error(`git ${args[0]}: ${String(r.stderr || r.error?.message || `exit ${r.status}`).trim()}`);
  return r.stdout;
}

const checkoutRoot = () => git(["rev-parse", "--show-toplevel"], { cwd: HERE }).trim();

/** The committed .gitattributes files, { path: text }, at `tree` (main's HEAD, or a base commit) in the checkout that
 * holds this script. */
function mainAttributes(tree) {
  const root = checkoutRoot();
  const files = {};
  for (const entry of git(["ls-tree", "-r", "-z", "--full-tree", tree], { cwd: root }).split("\0")) {
    const [, sha, path] = /^100(?:644|755) blob ([0-9a-f]+)\t(.+)$/s.exec(entry) ?? [];
    if (!path || !/(?:^|\/)\.gitattributes$/.test(path)) continue;
    if (path.split("/").some((part) => part === ".." || part.toLowerCase() === ".git")) throw new Error(`main's tree holds an unsafe path: ${path}`);
    files[path] = git(["cat-file", "blob", sha], { cwd: root });
  }
  return files;
}

/** The paths the .gitattributes committed at `tree` mark `linguist-generated`. They're copied into an empty repo and
 * checked there, so no info/attributes, global or system attributes file, working folder or head can add to them. */
export function generated(paths, tree = "HEAD") {
  if (!paths.length) return new Set();
  const scratch = mkdtempSync(join(tmpdir(), "onrails-attributes-"));
  try {
    const repo = join(scratch, "repo");
    mkdirSync(join(scratch, "no-templates"));
    git(["init", "-q", `--template=${join(scratch, "no-templates")}`, repo]);
    for (const [path, text] of Object.entries(mainAttributes(tree))) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }
    const out = git(["check-attr", "-z", "--stdin", "linguist-generated"], { cwd: repo, input: paths.join("\0") }).split("\0");
    const marked = new Set();
    for (let i = 0; i + 2 < out.length; i += 3) if (out[i + 2] === "set" || out[i + 2] === "true") marked.add(out[i]);
    return marked;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** A data file in a fixtures folder somewhere under a test folder, such as test/fixtures/page.json. */
export function isFixture(path) {
  const dirs = path.split("/").slice(0, -1);
  const test = dirs.findIndex((dir) => TEST_DIRS.has(dir));
  return test !== -1 && dirs.slice(test + 1).some((dir) => FIXTURE_DIRS.has(dir)) && !SOURCE.test(path);
}

const isCount = (n) => Number.isInteger(n) && n >= 0;

/** { total, excluded, biggest }: counted lines, skipped lines, and the biggest counted files ({ filename, lines }).
 * Throws on a count that isn't a whole number of 0 or more: what it can't read never passes. */
export function measure(files, isGenerated) {
  const bad = files.find((f) => !isCount(f.additions) || !isCount(f.deletions));
  if (bad) throw new Error(`${bad.filename} has a line count that isn't a whole number of 0 or more.`);
  const skippedPath = (path) => LOCKFILES.test(path) || isFixture(path) || isGenerated.has(path);
  const skipped = (f) => skippedPath(f.filename) && (!f.previous_filename || skippedPath(f.previous_filename));
  const lines = (f) => f.additions + f.deletions;
  const counted = files.filter((f) => !skipped(f));
  const sum = (list) => list.reduce((total, f) => total + lines(f), 0);
  const biggest = counted.map((f) => ({ filename: f.filename, lines: lines(f) })).filter((f) => f.lines > 0)
    .sort((a, b) => b.lines - a.lines || a.filename.localeCompare(b.filename)).slice(0, BIGGEST);
  return { total: sum(counted), excluded: sum(files) - sum(counted), biggest };
}

/** The description as the reader sees it: no HTML comments, fenced code blocks or indented code blocks. */
function shown(body) {
  return String(body ?? "").replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm, "")
    .split("\n").filter((line) => !/^(?: {4}|\t)/.test(line)).join("\n");
}

/** The reason on the description's visible `Size exception:` line, or null when there's none. */
export function exceptionReason(body) {
  const reason = EXCEPTION.exec(shown(body))?.[1];
  // The template's own placeholder isn't a reason, nor is a line with no word in it.
  return reason && !/^<[^>]*>$/.test(reason) && /\p{L}/u.test(reason) ? reason : null;
}

/** Null when the size passes; otherwise why it fails. `labels` and `body` are the pull request's; a local diff has none. */
export function sizeProblem(total, { labels = [], body = "" } = {}) {
  if (total < MAX_CHANGED_LINES) return null;
  const reason = exceptionReason(body);
  if (labels.includes(EXCEPTION_LABEL) && reason) return null;
  const over = `${total} changed lines (the limit is under ${MAX_CHANGED_LINES}; lockfiles, generated files and test fixtures not counted).`;
  if (labels.includes(EXCEPTION_LABEL)) return `${over} It has the ${EXCEPTION_LABEL} label but no "Size exception: <reason>" line in its description.`;
  return `${over} Split the pull request, or add the ${EXCEPTION_LABEL} label and a "Size exception: <reason>" line to its description.`;
}

/** `git diff --numstat -z -M` output as GitHub's file list: { filename, additions, deletions, previous_filename }.
 * A binary file is `-`, and counts 0. */
export function numstatFiles(text) {
  const parts = text.split("\0");
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const [added, removed, path] = parts[i].split("\t");
    if (removed === undefined) continue;
    const counts = { additions: Number(added) || 0, deletions: Number(removed) || 0 };
    // A rename leaves the path empty, then gives the old and the new name as the next two fields.
    if (path) files.push({ filename: path, ...counts });
    else files.push({ filename: parts[i + 2], previous_filename: parts[i + 1], ...counts }), (i += 2);
  }
  return files;
}

function report({ total, excluded, biggest }, what) {
  console.log(`${what}: ${total} changed lines counted, ${excluded} not counted (lockfiles, generated files, test fixtures).`);
  if (biggest.length) console.log(`Biggest files:\n${biggest.map((f) => `  ${f.lines}\t${f.filename}`).join("\n")}`);
}

/** True when `rev` names a commit in the checkout. */
function hasCommit(root, rev) {
  try {
    git(["cat-file", "-e", `${rev}^{commit}`], { cwd: root });
    return true;
  } catch {
    return false; // cat-file -e says only yes or no: a missing commit is its no.
  }
}

function readPull(repo, pr) {
  const pull = JSON.parse(gh(`repos/${repo}/pulls/${pr}`));
  const files = pages(`repos/${repo}/pulls/${pr}/files`);
  // GitHub's list stops at 3000 files, and a short list counts short. pr-rules.mjs, the gate, reads it more carefully.
  if (files.length !== pull.changed_files) throw new Error(`GitHub listed ${files.length} of the ${pull.changed_files} files #${pr} changes.`);
  const base = pull.base?.sha ?? "";
  if (!/^[0-9a-f]{40}$/.test(base)) throw new Error(`#${pr} has no base commit sha.`);
  if (!hasCommit(checkoutRoot(), base)) throw new Error(`The base ${base} isn't in this checkout: git fetch origin ${pull.base.ref}`);
  return { files, tree: base, labels: (pull.labels ?? []).map((l) => l.name), body: pull.body ?? "" };
}

// The branch's own .gitattributes could mark its text as binary (`binary`, `-diff`), which shows as `-` with no lines.
// So the diff runs with an empty work tree and an empty index: git then reads no .gitattributes from the branch, on
// any git version, and its own test decides what is binary (a NUL byte near the start, as GitHub's).
function readLocal(base) {
  const root = checkoutRoot();
  if (!hasCommit(root, base)) throw new Error(`${base} isn't a commit in this checkout.`);
  const tree = git(["rev-parse", "--verify", `${base}^{commit}`], { cwd: root }).trim();
  const from = git(["merge-base", tree, "HEAD"], { cwd: root }).trim();
  const gitDir = git(["rev-parse", "--absolute-git-dir"], { cwd: root }).trim();
  const empty = mkdtempSync(join(tmpdir(), "onrails-diff-"));
  try {
    const args = [`--git-dir=${gitDir}`, `--work-tree=${empty}`, "diff", "--numstat", "-z", "-M", "--no-textconv", "--no-ext-diff", from, "HEAD", "--"];
    const files = numstatFiles(git(args, { cwd: empty, env: { GIT_INDEX_FILE: join(empty, "index") } }));
    return { files, tree, labels: [], body: "" };
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
}

export function main(argv) {
  const { pr, repo } = prArgs(argv);
  const base = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] ?? "" : null;
  const onePull = pr && repo && base === null;
  if (!onePull && !(argv[0] === "--base" && argv.length === 2 && SAFE_REF.test(base ?? ""))) {
    console.error("Usage: pr-size.mjs <n> --repo <owner>/<name>, or pr-size.mjs --base <ref>");
    return 2;
  }
  let got;
  let size;
  try {
    got = pr ? readPull(repo, pr) : readLocal(base);
    size = measure(got.files, generated(changedPaths(got.files), got.tree));
  } catch (error) {
    console.error(`Couldn't count the size: ${String(error.stderr || error.message).trim()}`);
    return 2;
  }
  report(size, pr ? `#${pr}` : `HEAD against ${base}`);
  const problem = sizeProblem(size.total, got);
  if (problem) return console.error(problem), 1;
  if (size.total >= MAX_CHANGED_LINES) console.log(`Size exception: ${exceptionReason(got.body)}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
