#!/usr/bin/env node
// The pull request rules for a project whose stack has no `pr:rules` script (#225). `coordinate` step 6.1.3 runs it
// from your checkout of main, never from the head's clone:
//   node pr-rules.mjs <n> --repo owner/name --head <sha>
// The same rules as the TanStack pack's `pnpm pr:rules`: the description closes an issue (Closes, Fixes or
// Resolves #<n>), the branch is feat/<n>-name or fix/<n>-name for that issue, unless the pull request has the
// `no-issue` label or Dependabot opened it; and pr-size.mjs's size rule (#377): under 1,000 changed lines, unless it
// has the `size-exception` label and a `Size exception: <reason>` line. Lockfiles and test fixtures don't count, nor
// files main marks `linguist-generated` in a .gitattributes committed in the checkout that holds this script. A rename
// skips only when its old and new names both do. Every file the pull request adds, changes or renames to under
// docs/insights/ must be a record as `insights.mjs land --verify` takes it (its own recordProblem), read from GitHub
// at the head (#408). The pull request comes from the API as data; none of its code runs.
// Exit 0: every rule holds. 1: a rule is broken, the head moved, or GitHub's file list stops short of the pull
// request (it lists at most 3000 files) on two reads in a row. 2: a usage or API error, or counts that don't add up
// on two reads in a row. Never a pass.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAX_FILES, changedPaths, gh, pages, prArgs } from "./agent-files.mjs";
import { CAP, recordProblem } from "./insights-land.mjs";
import { generated, markBinaries, measure, sizeProblem } from "./pr-size.mjs";

const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i;
const BRANCH = /^(?:feat|fix)\/(\d+)-[a-z0-9][a-z0-9-]*$/;
// Any case: a path a case-insensitive disk folds onto docs/insights/ is checked too, and recordProblem refuses it.
const INSIGHTS = /^docs\/insights\//i;

/** Every reason the pull request isn't tied to an issue. Empty when it is. */
export function linkProblems({ body, branch, labels, author }) {
  if (author === "dependabot[bot]" || labels.includes("no-issue")) return [];
  const closes = CLOSES.exec(body);
  const named = BRANCH.exec(branch);
  const problems = [];
  if (!closes) problems.push("The description needs `Closes #<issue>` (or Fixes / Resolves).");
  if (!named) problems.push(`The branch "${branch}" must look like feat/<issue>-short-name or fix/<issue>-short-name.`);
  if (closes && named && closes[1] !== named[1]) problems.push(`The branch names issue #${named[1]} but the description closes #${closes[1]}.`);
  return problems;
}

/** Each file the pull request leaves under docs/insights/ that isn't a record exactly as the writer writes it, as
 * "path: why". A removed file leaves nothing to check. Throws when GitHub can't give a file's content at the head. */
function insightsProblems(repo, head, files) {
  const problems = [];
  for (const { filename, status } of files) {
    if (!INSIGHTS.test(filename) || status === "removed") continue;
    let file;
    try {
      file = JSON.parse(gh(`repos/${repo}/contents/${filename.split("/").map(encodeURIComponent).join("/")}?ref=${head}`));
    } catch (error) {
      throw new Error(`${filename}: ${String(error.stderr || error.message).trim()}`);
    }
    let why = null;
    if (file.type !== "file") why = "not a plain file";
    else if (file.size > CAP) why = `over ${CAP} bytes`;
    else if (file.encoding !== "base64" || typeof file.content !== "string") throw new Error(`GitHub didn't send ${filename}'s content.`);
    else why = recordProblem(filename, Buffer.from(file.content, "base64"));
    if (why) problems.push(`${filename}: ${why}. A file under docs/insights/ must be a record insights.mjs wrote, as \`land --verify\` checks it.`);
  }
  return problems;
}

/** One entry per path, the first: a file GitHub lists twice counts once, and can't stand in for one it left out. */
function distinct(files) {
  const seen = new Set();
  return files.filter((f) => !seen.has(f.filename) && seen.add(f.filename));
}

/** Why GitHub's list and totals can't be counted, or null. `cut` when the list stops at GitHub's cap. */
function listProblem(pull, files, pr) {
  const { changed_files: changed, additions, deletions } = pull;
  if (![changed, additions, deletions].every(Number.isInteger)) return { why: `GitHub gave no file or line count for #${pr}, so the size can't be counted.` };
  if (changed > MAX_FILES) return { cut: true, why: `GitHub listed ${files.length} of the ${changed} files #${pr} changes, twice (its list stops at ${MAX_FILES}), so the size can't be counted. Split the pull request.` };
  if (files.length !== changed) return { why: `GitHub listed ${files.length} different files, but #${pr} changes ${changed}, so the size can't be counted.` };
  const sum = files.reduce((total, f) => total + (f.additions ?? 0) + (f.deletions ?? 0), 0);
  if (sum !== additions + deletions) return { why: `#${pr}'s files add up to ${sum} changed lines, but #${pr} says ${additions + deletions}, so the size can't be counted.` };
  return null;
}

/** The pull request, its files, then the pull request again, so the files belong to the head both reads name. */
function read(repo, pr) {
  const first = JSON.parse(gh(`repos/${repo}/pulls/${pr}`));
  const files = distinct(pages(`repos/${repo}/pulls/${pr}/files`));
  return { first, files, pull: JSON.parse(gh(`repos/${repo}/pulls/${pr}`)) };
}

export function main(argv) {
  const { pr, repo, head } = prArgs(argv);
  if (!pr || !repo || !/^[0-9a-f]{40}$/.test(head ?? "")) {
    console.error("Usage: pr-rules.mjs <n> --repo <owner>/<name> --head <40-character sha>");
    return 2;
  }
  let got;
  let problem;
  // A list that doesn't add up is read once more, then decided: a retry every sweep would never end.
  for (let round = 0; round < 2; round++) {
    try {
      got = read(repo, pr);
    } catch (error) {
      console.error(`Couldn't read #${pr} from the API: ${String(error.stderr || error.message).trim()}`);
      return 2;
    }
    const moved = [got.first, got.pull].find((p) => p.head?.sha !== head);
    if (moved) {
      console.error(`The head moved: #${pr} is at ${moved.head?.sha}, not ${head}. Check the new head.`);
      return 1;
    }
    problem = listProblem(got.pull, got.files, pr);
    if (!problem) break;
  }
  if (problem) {
    console.error(problem.cut ? `${problem.why} That's a fail, never a pass.` : `${problem.why} That's never a pass: try again next sweep.`);
    return problem.cut ? 1 : 2;
  }
  const { pull, files } = got;
  const labels = (pull.labels ?? []).map((l) => l.name);
  const branch = pull.head.ref ?? "";
  const problems = linkProblems({ body: pull.body ?? "", branch, labels, author: pull.user?.login });
  let lines;
  try {
    lines = measure(markBinaries(repo, head, files), generated(changedPaths(files))).total;
  } catch (error) {
    console.error(`The size can't be counted: ${error.message}`);
    return 2;
  }
  const tooBig = sizeProblem(lines, { labels, body: pull.body ?? "" });
  if (tooBig) problems.push(tooBig);
  try {
    problems.push(...insightsProblems(repo, head, files));
  } catch (error) {
    console.error(`Couldn't read a file #${pr} changes under docs/insights/ at ${head}, so it can't pass. ${error.message}`);
    return 2;
  }
  for (const problem of problems) console.error(problem);
  if (problems.length) return 1;
  const closes = CLOSES.exec(pull.body ?? "")?.[1];
  console.log(`#${pr} @ ${head}: ${closes ? `closes #${closes} from ${branch}` : "needs no issue link"}, ${lines} changed lines.`);
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
