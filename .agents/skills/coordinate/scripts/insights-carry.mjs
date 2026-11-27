// The merge step's records (#333), run through insights.mjs from the coordinator's checkout of main:
//   carry --pr <n> --from <reviewed sha> --to <merge sha>   when the loop merged main into a reviewed branch
//       (`coordinate` step 7, decision 333-2): exit 0 only when <to> has exactly two parents, the first is <from>,
//       the second is on refs/remotes/origin/main (fetched first, never read by its short name, which a tag or a
//       local branch can shadow), a merge of the two has no conflict and gives exactly <to>'s tree, <from> has its job
//       and review records here, every review passed and every review job passed, and no review or review job at <to>
//       failed. The merge is `git merge-tree --write-tree`; a git before 2.38 has no --write-tree, so it merges in a
//       throwaway clone in TMPDIR that borrows this checkout's objects and changes none of its refs, index or files.
//       Then it writes a job record (job=carry-review, outcome=pass) and a copy of <from>'s latest review, both at
//       <to>, through the writer. A rerun writes nothing new. Exit 1 says why, and the merge commit goes to a fresh
//       pr-review. Exit 2: a usage or git error, or a sha that isn't a commit in this checkout.
// heldRecords() is what has-records and carry count: a file only when `land` would land it as it is.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAP, canonical, git, recordProblem } from "./insights-land.mjs";
import { VERSION, dayFolder, fileName, validate } from "./insights-record.mjs";

const SHA = /^[0-9a-f]{40}$/;
const MAIN = "refs/remotes/origin/main";
/** The jobs that review a head; each must have passed for its review to carry. */
const REVIEW_JOBS = ["review-code", "carry-review"];
const USAGE = "usage: insights.mjs carry --pr <n> --from <reviewed sha> --to <merge sha> (full 40-character shas)";

/**
 * Every record under root's docs/insights/<day>/ that land would land as it is (recordProblem), except board records,
 * which a script wrote for the board, not for this job. Throws when the folder can't be read.
 */
export function heldRecords(root) {
  const top = join(root, "docs", "insights");
  if (!existsSync(top)) return [];
  const held = [];
  for (const day of readdirSync(top)) {
    if (!lstatSync(join(top, day)).isDirectory()) continue;
    for (const name of readdirSync(join(top, day))) {
      const rel = `docs/insights/${day}/${name}`;
      const stat = lstatSync(join(root, rel));
      if (!stat.isFile() || stat.size > CAP) continue;
      const bytes = readFileSync(join(root, rel));
      if (recordProblem(rel, bytes)) continue;
      const record = JSON.parse(bytes.toString("utf8"));
      if (record.source !== "board") held.push(record);
    }
  }
  return held;
}

/** Writes a valid record as a new file in root's docs/insights/<day>/ and returns its path. Throws when it can't. */
export function save(root, record) {
  const dir = join(root, dayFolder(record));
  const path = join(dir, fileName(record));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, canonical(record), { flag: "wx" });
  return path;
}

/** git in root, for a command whose exit code is the answer: { status, out, err }. */
function ask(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) throw r.error;
  return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

function refuse(why) {
  process.stderr.write(`insights: not carried: ${why}. Send the merge commit to a fresh pr-review.\n`);
  process.exit(1);
}

/**
 * Merges `second` into `from` in a throwaway clone that borrows root's objects (`clone --shared`), so root's refs, index
 * and files stay as they are. Returns { tree } for a clean merge, { conflict: true }, or { why } when it can't merge.
 */
function mergeInClone(root, from, second) {
  const dir = mkdtempSync(join(tmpdir(), "onrails-carry-"));
  const clone = join(dir, "clone");
  try {
    git(dir, ["clone", "-q", "--shared", "--no-checkout", "--", root, clone]);
    git(clone, ["checkout", "-q", "--detach", from]);
    const id = ["-c", "user.name=onrails carry", "-c", "user.email=carry@onrails.invalid"];
    const merged = ask(clone, [...id, "merge", "-q", "--no-ff", "--no-commit", second]);
    if (merged.status === 0) return { tree: git(clone, ["write-tree"]) };
    if (git(clone, ["ls-files", "--unmerged"])) return { conflict: true };
    return { why: merged.err.split("\n")[0] || `git merge exited ${merged.status}` };
  } catch (e) {
    return { why: String(e.stderr || e.message).trim().split("\n")[0] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The clean merge of `second` into `from`: merge-tree where this git has --write-tree, else mergeInClone. */
function merge(root, from, second) {
  const tree = ask(root, ["merge-tree", "--write-tree", "--end-of-options", from, second]);
  if (tree.status === 0) return { tree: tree.out.split("\n")[0] };
  if (tree.status === 1) return { conflict: true };
  // Any other status: no --write-tree here (git before 2.38), or it failed. A plain merge works on any git.
  return mergeInClone(root, from, second);
}

/** Why `to` isn't exactly a clean merge of origin/main into `from`, or null. */
function notCleanMerge(root, from, to) {
  for (const sha of [from, to]) {
    if (ask(root, ["cat-file", "-e", "--end-of-options", `${sha}^{commit}`]).status !== 0) {
      throw new Error(`${sha} isn't a commit in this checkout: fetch the pull request's branch first`);
    }
  }
  const parents = git(root, ["rev-list", "--parents", "-n", "1", "--end-of-options", to]).split(" ").slice(1);
  if (parents.length !== 2) return `${to} has ${parents.length} parent(s), so it isn't a merge of main`;
  if (parents[0] !== from) return `${to}'s first parent is ${parents[0]}, not the reviewed ${from}`;
  const onMain = ask(root, ["merge-base", "--is-ancestor", "--end-of-options", parents[1], MAIN]);
  if (onMain.status === 1) return `${to}'s second parent ${parents[1]} isn't on origin/main`;
  if (onMain.status !== 0) throw new Error(onMain.err || "git merge-base failed");
  const merged = merge(root, from, parents[1]);
  if (merged.conflict) return "merging main into the reviewed sha conflicts, so the merge commit holds a conflict fix";
  if (merged.why) return `git couldn't redo the merge to prove it (${merged.why})`;
  const tree = git(root, ["rev-parse", "--verify", "--end-of-options", `${to}^{tree}`]);
  return merged.tree === tree ? null : `${to}'s tree isn't the clean merge of main: it holds a change of its own`;
}

/** The reviews that didn't pass and the review jobs that failed, among `records`, as text, or "" when none. */
function notPassed(records) {
  const bad = records.filter((r) => (r.kind === "review" && r.verdict !== "pass") || (r.kind === "job" && REVIEW_JOBS.includes(r.job) && r.outcome !== "pass"));
  return bad.map((r) => (r.kind === "review" ? `review round ${r.round}: ${r.verdict}` : `${r.job} job: ${r.outcome}`)).join(", ");
}

/** `carry`, from the checkout at root. */
export function carry(root, args) {
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const [pr, from, to] = ["--pr", "--from", "--to"].map(flag);
  if (args.length !== 6 || !/^\d+$/.test(pr ?? "") || !SHA.test(from ?? "") || !SHA.test(to ?? "")) throw new Error(USAGE);
  git(root, ["fetch", "-q", "origin", `+refs/heads/main:${MAIN}`]);
  const why = notCleanMerge(root, from, to);
  if (why) refuse(why);
  const held = heldRecords(root).filter((r) => r.pr === Number(pr));
  const kinds = (sha) => new Set(held.filter((r) => r.sha === sha).map((r) => r.kind));
  const atFrom = held.filter((r) => r.sha === from);
  const reviews = atFrom.filter((r) => r.kind === "review").sort((a, b) => a.at.localeCompare(b.at));
  if (!kinds(from).has("job") || !reviews.length) refuse(`#${pr} has no job and review records at the reviewed ${from} here: harvest first`);
  // Every review at that sha counts, not only the latest: a second review the dial added can't be outvoted.
  const failed = notPassed(atFrom);
  if (failed) refuse(`the reviewed sha's review didn't pass (${failed})`);
  // A fresh review of the merge commit itself that asked for changes stands: carry never papers over it.
  const own = notPassed(held.filter((r) => r.sha === to));
  if (own) refuse(`the merge commit's own review didn't pass (${own})`);
  const review = reviews.at(-1);
  const at = new Date(process.env.ONRAILS_NOW || Date.now()).toISOString();
  const made = {
    job: { v: VERSION, kind: "job", at, issue: review.issue, pr: Number(pr), sha: to, job: "carry-review", tool: null, model: "unknown", effort: "unknown", outcome: "pass" },
    review: { ...review, at, sha: to, job: "carry-review" },
  };
  const has = kinds(to);
  for (const [kind, record] of Object.entries(made)) {
    const errors = validate(record);
    if (errors.length) throw new Error(`the ${kind} record isn't valid: ${errors.join("; ")}`);
    if (!has.has(kind)) process.stdout.write(`${save(root, record)}\n`);
  }
  process.stdout.write(`#${pr}: carried the review of ${from} to the merge commit ${to}\n`);
}
