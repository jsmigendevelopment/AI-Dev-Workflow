// The merge step's records (#333), run through insights.mjs from the coordinator's checkout of main:
//   carry --pr <n> --from <reviewed sha> --to <merge sha>   when the loop merged main into a reviewed branch
//       (`coordinate` step 7, decision 333-2): exit 0 only when <to> has exactly two parents, the first is <from>,
//       the second is on origin/main, `git merge-tree --write-tree` of the two has no conflict and gives exactly
//       <to>'s tree, and <from> has its job and review records here. Then it writes a job record (job=carry-review,
//       outcome=pass) and a copy of <from>'s review, both at <to>, through the writer. A rerun writes nothing new.
//       Exit 1 says why, and the merge commit goes to a fresh pr-review. Exit 2: a usage or git error, or a sha that
//       isn't a commit in this checkout.
// heldRecords() is what has-records and carry count: a file only when `land` would land it as it is.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAP, canonical, git, recordProblem } from "./insights-land.mjs";
import { VERSION, dayFolder, fileName, validate } from "./insights-record.mjs";

const SHA = /^[0-9a-f]{40}$/;
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

/** git in root, for a command whose exit code is the answer: { status, out }. */
function ask(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) throw r.error;
  return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

function refuse(why) {
  process.stderr.write(`insights: not carried: ${why}. Send the merge commit to a fresh pr-review.\n`);
  process.exit(1);
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
  const onMain = ask(root, ["merge-base", "--is-ancestor", "--end-of-options", parents[1], "origin/main"]);
  if (onMain.status === 1) return `${to}'s second parent ${parents[1]} isn't on origin/main`;
  if (onMain.status !== 0) throw new Error(onMain.err || "git merge-base failed");
  const merged = ask(root, ["merge-tree", "--write-tree", "--end-of-options", from, parents[1]]);
  if (merged.status === 1) return "merging main into the reviewed sha conflicts, so the merge commit holds a conflict fix";
  if (merged.status !== 0) throw new Error(merged.err || "git merge-tree failed");
  const tree = git(root, ["rev-parse", "--verify", "--end-of-options", `${to}^{tree}`]);
  return merged.out.split("\n")[0] === tree ? null : `${to}'s tree isn't the clean merge of main: it holds a change of its own`;
}

/** `carry`, from the checkout at root. */
export function carry(root, args) {
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const [pr, from, to] = ["--pr", "--from", "--to"].map(flag);
  if (args.length !== 6 || !/^\d+$/.test(pr ?? "") || !SHA.test(from ?? "") || !SHA.test(to ?? "")) throw new Error(USAGE);
  git(root, ["fetch", "-q", "origin", "main"]);
  const why = notCleanMerge(root, from, to);
  if (why) refuse(why);
  const held = heldRecords(root).filter((r) => r.pr === Number(pr));
  const kinds = (sha) => new Set(held.filter((r) => r.sha === sha).map((r) => r.kind));
  const review = held.filter((r) => r.sha === from && r.kind === "review").sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (!kinds(from).has("job") || !review) refuse(`#${pr} has no job and review records at the reviewed ${from} here: harvest first`);
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
