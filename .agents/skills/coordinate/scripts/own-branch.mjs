#!/usr/bin/env node
// The local gate only runs the loop's own branches (#131). Before `coordinate` step 6.1 checks out a pull
// request, run this from your checkout of main:
//   node own-branch.mjs <n> --repo owner/name
// It passes when the pull request's branch is in this repo, not a fork, is feat/<issue>-... or fix/<issue>-...,
// and that issue has a claim comment that names it: "Claimed by <session> at <time> · branch <name>".
// On a pass it prints the head's full sha. It reads the API only, and runs nothing from the pull request.
// Exit 0: the loop's own branch. 1: not, so never check it out or run it. 2: a usage or API error.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gh, pages, prArgs } from "./agent-files.mjs";

const BRANCH = /^(?:feat|fix)\/(\d+)-/;
const ONLY = "The local gate only runs the loop's own branches.";
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pass for the loop's own branch: in `repo`, and named by its issue's claim. `commentsOf(issue)` lists that issue's comments. */
export function ownBranch(repo, pull, commentsOf) {
  const { ref = "", sha, repo: from } = pull.head ?? {};
  const where = from?.full_name;
  if (where?.toLowerCase() !== repo.toLowerCase()) return { pass: false, why: `The branch is in ${where ?? "a repository that's gone"}, not ${repo}. ${ONLY}` };
  const issue = ref.match(BRANCH)?.[1];
  if (!issue) return { pass: false, why: `${ref} isn't a feat/<n>- or fix/<n>- branch. ${ONLY}` };
  const claim = new RegExp(`^Claimed by .*\\bbranch \`?${escape(ref)}\`?(?:\\s|$)`, "m");
  if (!commentsOf(issue).some((c) => claim.test(c.body ?? ""))) return { pass: false, why: `No claim comment on #${issue} names ${ref}. ${ONLY}` };
  return { pass: true, why: `${sha}: ${ref} is this loop's branch for #${issue}` };
}

export function main(argv) {
  const { pr, repo } = prArgs(argv);
  if (!pr || !repo) {
    console.error("Usage: own-branch.mjs <n> --repo <owner>/<name>");
    return 2;
  }
  let r;
  try {
    r = ownBranch(repo, JSON.parse(gh(`repos/${repo}/pulls/${pr}`)), (issue) => pages(`repos/${repo}/issues/${issue}/comments`));
  } catch (error) {
    console.error(`Couldn't read #${pr} from the API, so check nothing out: ${String(error.stderr || error.message).trim()}`);
    return 2;
  }
  (r.pass ? console.log : console.error)(r.why);
  return r.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
