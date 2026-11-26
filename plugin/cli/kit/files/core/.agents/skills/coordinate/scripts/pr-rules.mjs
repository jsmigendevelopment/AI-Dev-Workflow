#!/usr/bin/env node
// The pull request rules for a project whose stack has no `pr:rules` script (#225). `coordinate` step 6.1.3 runs it
// from your checkout of main, so a pull request can't change the rules it is checked by:
//   node pr-rules.mjs <n> --repo owner/name --head <sha>
// The same rules as the TanStack pack's `pnpm pr:rules`: the description closes an issue (Closes, Fixes or
// Resolves #<n>), the branch is feat/<n>-name or fix/<n>-name for that issue, unless the pull request has the
// `no-issue` label or Dependabot opened it; and at most 400 changed lines, unless it has the `large-pr` label.
// Lockfiles don't count, nor files this checkout's .gitattributes marks `linguist-generated`.
// Exit 0: every rule holds. 1: a rule is broken, or the head moved. 2: a usage or API error.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gh, pages, prArgs } from "./agent-files.mjs";

const MAX_CHANGED_LINES = 400;
const LOCKFILES = /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|deno\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/;
const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i;
const BRANCH = /^(?:feat|fix)\/(\d+)-[a-z0-9][a-z0-9-]*$/;

/** The paths git's attributes in this folder mark `linguist-generated`. None when git can't say. */
function generated(paths) {
  if (!paths.length) return new Set();
  const r = spawnSync("git", ["check-attr", "-z", "--stdin", "linguist-generated"], { input: paths.join("\0"), encoding: "utf8" });
  if (r.status !== 0) return new Set();
  const out = r.stdout.split("\0");
  const marked = new Set();
  for (let i = 0; i + 2 < out.length; i += 3) if (out[i + 2] === "set" || out[i + 2] === "true") marked.add(out[i]);
  return marked;
}

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

/** Lines added plus removed, without lockfiles and generated files. */
export function changedLines(files, isGenerated) {
  return files
    .filter((f) => !LOCKFILES.test(f.filename) && !isGenerated.has(f.filename))
    .reduce((sum, f) => sum + (f.additions ?? 0) + (f.deletions ?? 0), 0);
}

export function main(argv) {
  const { pr, repo, head } = prArgs(argv);
  if (!pr || !repo || !/^[0-9a-f]{40}$/.test(head ?? "")) {
    console.error("Usage: pr-rules.mjs <n> --repo <owner>/<name> --head <40-character sha>");
    return 2;
  }
  let pull;
  let files;
  try {
    pull = JSON.parse(gh(`repos/${repo}/pulls/${pr}`));
    files = pages(`repos/${repo}/pulls/${pr}/files`);
  } catch (error) {
    console.error(`Couldn't read #${pr} from the API: ${String(error.stderr || error.message).trim()}`);
    return 2;
  }
  if (pull.head?.sha !== head) {
    console.error(`The head moved: #${pr} is at ${pull.head?.sha}, not ${head}. Check the new head.`);
    return 1;
  }
  const labels = (pull.labels ?? []).map((l) => l.name);
  const branch = pull.head.ref ?? "";
  const problems = linkProblems({ body: pull.body ?? "", branch, labels, author: pull.user?.login });
  const lines = changedLines(files, generated(files.map((f) => f.filename)));
  if (lines > MAX_CHANGED_LINES && !labels.includes("large-pr")) {
    problems.push(`${lines} changed lines (over ${MAX_CHANGED_LINES}, lockfiles and generated files not counted). Split the pull request, or add the large-pr label and say why in the description.`);
  }
  for (const problem of problems) console.error(problem);
  if (problems.length) return 1;
  const closes = CLOSES.exec(pull.body ?? "")?.[1];
  console.log(`#${pr} @ ${head}: ${closes ? `closes #${closes} from ${branch}` : "needs no issue link"}, ${lines} changed lines.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
