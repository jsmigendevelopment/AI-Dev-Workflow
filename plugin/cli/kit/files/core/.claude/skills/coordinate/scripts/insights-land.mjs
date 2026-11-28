// `insights.mjs land` and the record-file check it shares with `harvest` (#332). Run it through insights.mjs:
//   land [--repo <owner>/<name>]   lands every valid record file in the checkout that isn't on main. gh's own
//       open records pull request (a chore/insights- branch it opened in this repo) gets the missing files as one more
//       commit, a fast-forward, and its number is printed. With none open, it pushes chore/insights-<day>-<hhmm> off
//       main with only those files, opens a pull request and prints its number. Either way the pull request
//       gets the no-issue and size-exception labels and the "Size exception:" body line it lacks (#377's size rule).
//       Nothing pending: prints nothing and calls no API. It stages the files in the checkout, so the pull after the merge is
//       clean (decision 332-2).
//   land --verify <pr> [--repo <owner>/<name>]   the review of a records-only pull request (decision 332-1): exit 0
//       and the head sha only if gh's own login opened it from a chore/insights- branch of this repo (same repo id)
//       against main, and every changed file is an added plain file under docs/insights/, at most CAP bytes, in the
//       writer's exact bytes, a valid record, with the name the writer gives it. Exit 1 names each file that isn't.
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

// What every git call here drops, as carry's fetch does (decision 333-2): the variables that move the repository, and
// config given through the environment. A hook exports GIT_DIR and GIT_INDEX_FILE, which would point land's reads,
// commit, push and staging at another repository or index (#422). HOME, the config files it names, tokens and
// transport variables stay: the push's login lives there.
const MOVES_REPO = /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CEILING_DIRECTORIES|COMMON_DIR|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/;
/** The env for land's git: no repository-moving variable, and a missing login fails at once instead of prompting. */
const gitEnv = () => ({ ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !MOVES_REPO.test(name))), GIT_TERMINAL_PROMPT: "0" });

/** git in root: trimmed text, or the raw bytes as a Buffer with `bytes`. */
export const git = (root, args, { env = gitEnv(), bytes = false } = {}) => {
  const out = execFileSync("git", args, { ...OPTS, cwd: root, env, encoding: bytes ? "buffer" : "utf8" });
  return bytes ? out : out.trim();
};
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
  git(root, ["fetch", "-q", "origin", `refs/heads/${pull.head.ref}`]);
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
  if (missing.length) git(root, ["push", "-q", "origin", `${commitOn(root, sha, missing)}:refs/heads/${pull.head.ref}`]);
}

function openNew(root, repo, files) {
  const iso = new Date(process.env.ONRAILS_NOW || Date.now()).toISOString();
  const branch = `chore/insights-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  git(root, ["push", "-q", "origin", `${commitOn(root, MAIN, files)}:refs/heads/${branch}`]);
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

function open(root, repo) {
  const files = pending(root);
  if (!files.length) return;
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
  if (!/^\d+$/.test(pr ?? "")) throw new Error("usage: insights.mjs land --verify <pr> [--repo <owner>/<name>]");
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

/** `land` and `land --verify`, from the checkout at root. */
export function land(root, args) {
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const origin = /github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(git(root, ["remote", "get-url", "origin"]))?.[1];
  const repo = flag("--repo") ?? origin;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new Error("pass --repo <owner>/<name>: origin isn't a GitHub URL");
  git(root, ["fetch", "-q", "origin", `+refs/heads/${BASE}:${MAIN}`]);
  if (args.includes("--verify")) verify(root, repo, flag("--verify"));
  else open(root, repo);
}
