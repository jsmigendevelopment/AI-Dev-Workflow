// `insights.mjs land` and the record-file check it shares with `harvest` (#332). Run it through insights.mjs:
//   land [--repo <owner>/<name>] [--now]   lands every valid record file in the checkout that isn't on main. gh's own
//       open records pull request (a chore/insights- branch it opened in this repo) gets the missing files as one more
//       commit, a fast-forward, and its number is printed. With none open, it pushes chore/insights-<day>-<hhmm> off
//       main with only those files, opens a pull request and prints its number. Either way the pull request
//       gets the no-issue and size-exception labels and the "Size exception:" body line it lacks (#377's size rule).
//       Nothing pending: prints nothing and calls no API. It stages the files in the checkout, so the pull after the merge is
//       clean (decision 332-2). Held (#748): under HOLD_RECORDS pending records whose oldest is under HOLD_MINUTES old
//       and no --now: one `held:` line, no API call, nothing staged, exit 0. The files stay in the checkout (harvest
//       and has-records read them there) and the next land counts them again. Age is the record's own `at`.
//   land --verify <pr> [--repo <owner>/<name>]   the review of a records-only pull request (decision 332-1): exit 0
//       and the head sha only if gh's own login opened it from a chore/insights- branch of this repo (same repo id)
//       against main, and every changed file is an added plain file under docs/insights/, at most CAP bytes, in the
//       writer's exact bytes, a valid record, with the name the writer gives it. Exit 1 names each file that isn't.
// Any other flag, a repeated one, a flag without its value, or --verify with --now: exit 2 with LAND_USAGE, before any
// git or API call (#748).
// Main is always refs/remotes/origin/main, fetched with an explicit refspec, never the short name origin/main, which a
// tag or a local branch can shadow (#422). Every git call drops the variables that move the repository (MOVES_REPO).
// Exit 2: a usage, git or API error, or a head that moved while it was read.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gh, pages } from "./agent-files.mjs";
import { dayFolder, fileName, validate } from "./insights-record.mjs";
import { exceptionReason } from "./pr-size.mjs";

const BASE = "main";
/** Records wait for a batch (#748): land when this many are pending, or the oldest is this old, or with --now. An AI pick. */
export const HOLD_RECORDS = 12;
export const HOLD_MINUTES = 90;
export const LAND_USAGE = "usage: insights.mjs land [--repo <owner>/<name>] [--now] | land --verify <pr> [--repo <owner>/<name>]";
/** Main as land reads it: never by the short name origin/main, which a tag or a local branch of that name shadows (#422). */
const MAIN = "refs/remotes/origin/main";
/** The most bytes a record file may have: the writer's biggest real record is under 2 KB. */
export const CAP = 16384;
const RECORD_PATH = /^docs\/insights\/\d{4}-\d{2}-\d{2}\/[^/]+\.json$/;
const CHORE = /^chore\/insights-\d{4}-\d{2}-\d{2}-\d{4}$/;
const OPTS = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };

/** The labels and body line a records pull request carries: #377's size rule reads both. */
const LABELS = ["no-issue", "size-exception"];
const SIZE_LINE = "Size exception: insights records only, each checked by land --verify";

// What every git call here drops: the variables that move the repository, and GIT_CONFIG_PARAMETERS, which `git -c`
// hands down. A hook exports GIT_DIR and GIT_INDEX_FILE, which would point land's reads, commit, push and staging at
// another repository or index (#422). Land is not carry's fetch (decision 333-2, which also drops GIT_CONFIG_GLOBAL,
// GIT_CONFIG_SYSTEM and GIT_CONFIG_NOSYSTEM and passes -c flags): land keeps every config file, and GIT_CONFIG_COUNT with
// its KEY_n and VALUE_n, so a url insteadOf rewrite an environment sets git up with still reaches the fetch and the push
// (#450, decision 422-1). HOME, tokens and transport variables stay too: the push's login lives there.
const MOVES_REPO = /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CEILING_DIRECTORIES|COMMON_DIR|CONFIG_PARAMETERS)$/;
/** The env for land's git: no repository-moving variable, and a missing login fails at once instead of prompting. */
const gitEnv = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !MOVES_REPO.test(name))), GIT_TERMINAL_PROMPT: "0" });

/** git in root: trimmed text, or the raw bytes as a Buffer with `bytes`. */
export const git = (root, args, { env = gitEnv(), bytes = false } = {}) => {
  const out = execFileSync("git", args, { ...OPTS, cwd: root, env, encoding: bytes ? "buffer" : "utf8" });
  return bytes ? out : out.trim();
};
/**
 * The checkout that holds `dir`, found with land's own env (gitEnv), so a GIT_DIR or GIT_WORK_TREE that names another
 * clone can't move land, or any command that finds its checkout here, off the folder it was started in (#450). The
 * global config stays, so a safe.directory kept there still works. Throws when `dir` isn't in a checkout.
 */
export const checkoutAt = (dir) => git(dir, ["rev-parse", "--show-toplevel"]);
const warn = (message) => process.stderr.write(`insights: ${message}\n`);

/** A record's file text, exactly as the writer and harvest write it. */
export const canonical = (record) => `${JSON.stringify(record, null, 2)}\n`;

/** Why the file at `path` (from the repo root) with these bytes isn't a record exactly as the writer writes it, or null. */
export function recordProblem(path, bytes) {
  if (!RECORD_PATH.test(path)) return "not a record file in docs/insights/<yyyy-mm-dd>/";
  if (bytes.length > CAP) return `over ${CAP} bytes`;
  let record;
  try { record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return "isn't UTF-8 JSON"; }
  const errors = validate(record);
  if (errors.length) return errors.join("; ");
  // Bytes, not decoded text: a raw byte that isn't UTF-8 would decode to U+FFFD on both sides.
  if (!Buffer.from(canonical(record)).equals(bytes)) return "not in the writer's exact bytes (2-space JSON, each key once, a final newline)";
  const id = /-([0-9a-f]{6})\.json$/.exec(path)?.[1] ?? "<id>";
  const want = `${dayFolder(record)}/${fileName(record, id)}`;
  return want === path ? null : `its name doesn't match the record: want ${dayFolder(record)}/${fileName(record, "<id>")}`;
}

/** gh's own login: the coordinator's. */
export function ownLogin() {
  const login = JSON.parse(gh("user")).login;
  if (typeof login !== "string" || !login) throw new Error("gh api user named no login");
  return login;
}

/** gh's own login and numeric user ID, the ID a rename or a recycled login can't take over (#408). */
export function ownAccount() {
  const { login, id } = JSON.parse(gh("user"));
  if (typeof login !== "string" || !login) throw new Error("gh api user named no login");
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("gh api user named no user ID");
  return { login, id };
}

/** The head is a branch of the base repo itself, by id, which survives a rename or a change of case. */
const sameRepo = (pull) => Number.isInteger(pull.head?.repo?.id) && pull.head.repo.id === pull.base?.repo?.id;
/** Why `pull` isn't a records pull request that `me` opened, or null. */
function notRecordsPull(pull, me) {
  if (String(pull.user?.login).toLowerCase() !== me.toLowerCase()) return `${pull.user?.login} opened it, not ${me}`;
  if (!CHORE.test(String(pull.head?.ref)) || !sameRepo(pull)) return `${pull.head?.repo?.full_name}:${pull.head?.ref} isn't a chore/insights- branch of this repo`;
  return pull.base?.ref === BASE ? null : `its base is ${pull.base?.ref}, not ${BASE}`;
}

/** Fetches the pull request's branch and returns its head, which must be the sha GitHub gave. */
function fetchHead(root, pull) {
  git(root, ["fetch", "-q", "--no-tags", "origin", `refs/heads/${pull.head.ref}`]);
  const sha = git(root, ["rev-parse", "FETCH_HEAD"]);
  if (sha !== pull.head.sha) throw new Error(`#${pull.number}'s head moved: GitHub says ${pull.head.sha}, origin has ${sha}. Run it again.`);
  return sha;
}

/** Record files on disk that aren't on main. An invalid one is named and left out. */
function pending(root) {
  const onMain = new Set(git(root, ["ls-tree", "-r", "--name-only", MAIN, "--", "docs/insights"]).split("\n"));
  const top = join(root, "docs", "insights");
  const files = [];
  for (const day of existsSync(top) ? readdirSync(top).sort() : []) {
    if (!lstatSync(join(top, day)).isDirectory()) continue;
    for (const name of readdirSync(join(top, day)).sort()) {
      const path = `docs/insights/${day}/${name}`;
      const stat = lstatSync(join(root, path));
      if (onMain.has(path) || !stat.isFile()) continue;
      const problem = stat.size > CAP ? `over ${CAP} bytes` : recordProblem(path, readFileSync(join(root, path)));
      if (problem) warn(`left out ${path}: ${problem}`);
      else files.push(path);
    }
  }
  return files;
}

/** One commit on `parent` that adds `files`, made in a temp index so the checkout's own index stays as it is. */
function commitOn(root, parent, files) {
  const dir = mkdtempSync(join(tmpdir(), "onrails-insights-"));
  try {
    const env = { ...gitEnv(), GIT_INDEX_FILE: join(dir, "index") };
    git(root, ["read-tree", parent], { env });
    for (const path of files) {
      git(root, ["update-index", "--add", "--cacheinfo", `100644,${git(root, ["hash-object", "-w", "--", path])},${path}`], { env });
    }
    const tree = git(root, ["write-tree"], { env });
    return git(root, ["commit-tree", tree, "-p", parent, "-m", `Insights records: ${files.length} file(s), no issue`], { env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Adds the files the open records pull request lacks, as a fast-forward of its branch. */
function grow(root, pull, files) {
  const sha = fetchHead(root, pull);
  const has = new Set(git(root, ["ls-tree", "-r", "--name-only", sha, "--", "docs/insights"]).split("\n"));
  const missing = files.filter((f) => !has.has(f));
  if (missing.length) git(root, ["push", "-q", "--no-follow-tags", "origin", `${commitOn(root, sha, missing)}:refs/heads/${pull.head.ref}`]);
}

function openNew(root, repo, files) {
  const iso = new Date(process.env.ONRAILS_NOW || Date.now()).toISOString();
  const branch = `chore/insights-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  git(root, ["push", "-q", "--no-follow-tags", "origin", `${commitOn(root, MAIN, files)}:refs/heads/${branch}`]);
  const body = [
    `Records only, from \`insights.mjs land\`: ${files.length} file(s) under docs/insights/. Its review is \`insights.mjs land --verify\` (decision 332-1).`,
    "",
    SIZE_LINE,
    "",
    ...files.map((f) => `- ${f}`),
  ].join("\n");
  const pull = JSON.parse(gh("-X", "POST", "-f", "title=Insights records (no issue)", "-f", `body=${body}`, "-f", `head=${branch}`, "-f", `base=${BASE}`, `repos/${repo}/pulls`));
  return { ...pull, body, labels: [] };
}

/** Puts back any of LABELS and the size line the pull request lacks. A failed write here is redone next sweep. */
function mark(repo, pull) {
  const missing = LABELS.filter((l) => !(pull.labels ?? []).some((x) => x?.name === l));
  if (missing.length) gh("-X", "POST", ...missing.flatMap((l) => ["-f", `labels[]=${l}`]), `repos/${repo}/issues/${pull.number}/labels`);
  // Read as #377's rule reads it: a line in an HTML comment or a code block doesn't count. The new line goes first, so
  // an unclosed comment or fence in the old body can't hide it (#411).
  const body = String(pull.body ?? "");
  if (!exceptionReason(body)) gh("-X", "PATCH", "-f", `body=${[SIZE_LINE, body.trimEnd()].filter(Boolean).join("\n\n")}\n`, `repos/${repo}/pulls/${pull.number}`);
}

/** The whole minutes since the oldest of these record files' own `at`, never below 0. */
function oldestMinutes(root, files) {
  const at = Math.min(...files.map((f) => Date.parse(JSON.parse(readFileSync(join(root, f), "utf8")).at)));
  const now = Date.parse(process.env.ONRAILS_NOW ?? "") || Date.now();
  return Math.max(0, Math.floor((now - at) / 60000));
}

function open(root, repo, now) {
  const files = pending(root);
  if (!files.length) return;
  if (!now && files.length < HOLD_RECORDS) {
    const age = oldestMinutes(root, files);
    if (age < HOLD_MINUTES) {
      process.stdout.write(`held: ${files.length} record${files.length === 1 ? "" : "s"}, oldest ${age} min; lands at ${HOLD_RECORDS} records, ${HOLD_MINUTES} min or with --now\n`);
      return;
    }
  }
  const me = ownLogin();
  const mine = pages(`repos/${repo}/pulls?state=open&per_page=100`).filter((p) => !notRecordsPull(p, me)).sort((a, b) => a.number - b.number);
  for (const extra of mine.slice(1)) warn(`#${extra.number} is another open records pull request: close it and delete its branch`);
  if (mine.length) grow(root, mine[0], files);
  const pull = mine.length ? mine[0] : openNew(root, repo, files);
  // Staged, an identical file the merge brings in doesn't stop `git pull --ff-only`; untracked, it would.
  git(root, ["add", "--", ...files]);
  process.stdout.write(`${pull.number}\n`);
  mark(repo, pull);
}

/** Each changed file between main and sha as [path, why it isn't an added record]. Empty: all good. */
function badFiles(root, sha) {
  const parts = git(root, ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", `${MAIN}...${sha}`]).split("\0").filter(Boolean);
  if (!parts.length) return [["(none)", "it changes no file"]];
  const bad = [];
  for (let i = 0; i < parts.length; i += 2) {
    const [, mode, , blob, status] = parts[i].slice(1).split(" ");
    const path = parts[i + 1];
    let why = null;
    if (!path.startsWith("docs/insights/")) why = "outside docs/insights/";
    else if (status !== "A") why = `changed (${status}), not added`;
    else if (mode !== "100644") why = "not a plain file";
    // The size first: a big blob is refused, never read (a read over 1 MB would fail as an error, not a refusal).
    else if (Number(git(root, ["cat-file", "-s", blob])) > CAP) why = `over ${CAP} bytes`;
    else why = recordProblem(path, git(root, ["cat-file", "blob", blob], { bytes: true }));
    if (why) bad.push([path, why]);
  }
  return bad;
}

function verify(root, repo, pr) {
  const pull = JSON.parse(gh(`repos/${repo}/pulls/${pr}`));
  const refuse = (why) => {
    warn(`#${pr} isn't a records-only pull request: ${why}`);
    process.exit(1);
  };
  const why = notRecordsPull(pull, ownLogin());
  if (why) refuse(why);
  const sha = fetchHead(root, pull);
  const bad = badFiles(root, sha);
  for (const [path, reason] of bad) warn(`${path}: ${reason}`);
  if (bad.length) refuse(`${bad.length} file(s) above`);
  process.stdout.write(`${sha}\n`);
}

/** The flags of `land` as { repo, verify, now }, or null for anything LAND_USAGE doesn't allow. Reads no git, no API. */
export function parseLand(args) {
  const got = { repo: undefined, verify: undefined, now: false };
  for (let i = 0; i < args.length; i++) {
    const name = args[i].slice(2);
    if (args[i] === "--now" && !got.now) got.now = true;
    else if ((name === "repo" || name === "verify") && args[i].startsWith("--") && got[name] === undefined && args[i + 1] !== undefined && !args[i + 1].startsWith("-")) got[name] = args[++i];
    else return null;
  }
  return got.verify !== undefined && (got.now || !/^\d+$/.test(got.verify)) ? null : got;
}

/** `land` and `land --verify`, from the checkout at root. */
export function land(root, args) {
  const flags = parseLand(args);
  if (!flags) throw new Error(LAND_USAGE);
  const origin = /github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(git(root, ["remote", "get-url", "origin"]))?.[1];
  const repo = flags.repo ?? origin;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new Error("pass --repo <owner>/<name>: origin isn't a GitHub URL");
  git(root, ["fetch", "-q", "--no-tags", "origin", `+refs/heads/${BASE}:${MAIN}`]);
  if (flags.verify !== undefined) verify(root, repo, flags.verify);
  else open(root, repo, flags.now);
}
