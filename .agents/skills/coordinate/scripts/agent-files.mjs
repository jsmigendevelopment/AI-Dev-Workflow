#!/usr/bin/env node
// The agent-file guard, run by .github/workflows/agent-files.yml. A pull request that changes the
// agents' rules, check code or the automation level passes with the `human-approved` label. On Full
// automation it also passes on the weakening review (#103): a comment, from someone with write access,
// that is the line
//   Weakening review: pass @ <full head sha>
// and no fail comment at that commit. A fail sticks: no later pass undoes it.
// The workflow runs from the default branch and this file from that checkout, so a pull request can't
// change either. The level is read from docs/stack.md there. The pull request's files, labels and
// comments are read through the API as data; none of its code runs.
//   node agent-files.mjs --pr <n>          the check (env REPO, GH_TOKEN, HEAD_SHA: the event's head)
//   node agent-files.mjs verify-run <n> [--repo owner/name]   before a merge: the head's agent-files runs are real and green
// Tests: --files <json> --stack <file> --comments <json> --labels a,b --head <sha> --trusted a,b
//        verify-run --runs <json>
// Exit 0 passes, 1 fails. No dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Paths that change the agents' rules, the checks, or the automation level the guard reads. */
export const RULE_FILES = /^(AGENTS\.md|CLAUDE\.md|\.agents\/|\.claude\/|\.codex\/|\.github\/|docs\/stack\.md$)/;
export const GUARD_WORKFLOW = ".github/workflows/agent-files.yml";
// GitHub's pull request file list stops at 3000 files.
export const MAX_FILES = 3000;
const VERDICT = /^Weakening review: (pass|fail) @ ([0-9a-f]{40})\s*$/gm;
const WRITE = new Set(["admin", "maintain", "write"]);
// A path with a line break or control character could forge a log command, so it's refused.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f]");

/** The automation level in a docs/stack.md text: "- **Level:** full". Recommended when it's missing. */
export const level = (stack = "") => stack.match(/\*\*Level:\*\*\s*`?([a-z-]+)/i)?.[1].toLowerCase() ?? "recommended";

/** Every path a pull request touches, from the API's file list: a rename counts both names. */
export const changedPaths = (files) => files.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean));

/** The verdicts a comment gives at this commit: a Set of "pass" and "fail". */
const verdictsIn = (body = "", head) => new Set([...body.matchAll(VERDICT)].filter((m) => m[2] === head).map((m) => m[1]));

/** A comment's verdict at this commit: "pass", "fail", or null. Both lines in one comment count as a fail. */
export function verdictOf(body, head) {
  const found = verdictsIn(body, head);
  return found.has("fail") ? "fail" : found.has("pass") ? "pass" : null;
}

/** The verdict at the head from trusted logins: any fail beats every pass, in any order, edited or not. */
export function headVerdict(comments, head, trusted) {
  const verdicts = comments.filter((c) => trusted.has(c.user?.login)).map((c) => verdictOf(c.body, head));
  return verdicts.includes("fail") ? "fail" : verdicts.includes("pass") ? "pass" : null;
}

/** Pass or fail, and why. */
export function decide({ changed = [], labels = [], stack = "", comments = [], head = "", trusted = new Set(), expected = null, total = null }) {
  if (expected && head && expected !== head) return { pass: false, why: `The pull request's head moved from ${expected} to ${head}. The run for the new head decides.` };
  if (total !== null && (total > MAX_FILES || total > changed.length)) {
    return { pass: false, why: `The pull request changes ${total} files, and the API listed ${changed.length} (it stops at ${MAX_FILES}). The guard can't see them all, so it fails. Split the pull request.` };
  }
  const odd = changed.filter((p) => CONTROL.test(p));
  if (odd.length) return { pass: false, why: `A file name has a control character or a line break: ${odd.map((p) => JSON.stringify(p)).join(", ")}. Rename it.` };
  const rules = [...new Set(changed.filter((p) => RULE_FILES.test(p)))];
  if (!rules.length) return { pass: true, why: "no agent rule, check or level files changed" };
  if (labels.includes("human-approved")) return { pass: true, why: "the human-approved label" };
  const full = level(stack) === "full";
  const verdict = full ? headVerdict(comments, head, trusted) : null;
  if (verdict === "pass") return { pass: true, why: `the weakening review passed at ${head}` };
  const need = full ? `a "Weakening review: pass @ ${head || "<head sha>"}" comment from someone with write access (Full automation), or the human-approved label`
    : "the human-approved label";
  const failed = verdict === "fail" ? `The weakening review failed at ${head}, and a fail sticks.\n` : "";
  return { pass: false, why: `${failed}These files change the agents' rules and need ${need}:\n${rules.join("\n")}` };
}

/**
 * Before a merge: every `agent-files` check run on the head comes from the guard's own workflow (a second
 * job with that name is refused), and the latest run of the guard on a pull_request_target event passed.
 * Runs: [{ id, status, conclusion, path, event }].
 */
export function verifyRuns(runs) {
  const others = runs.filter((r) => r.path !== GUARD_WORKFLOW);
  if (others.length) return { pass: false, why: `Another workflow reports a check named agent-files: ${[...new Set(others.map((r) => r.path))].join(", ")}. Refused.` };
  const guard = runs.filter((r) => r.event === "pull_request_target").sort((a, b) => a.id - b.id);
  const latest = guard.at(-1);
  if (!latest) return { pass: false, why: "No agent-files run from the guard's workflow on a pull_request_target event at the head." };
  if (latest.status !== "completed" || latest.conclusion !== "success") return { pass: false, why: `The latest agent-files run is ${latest.status}, ${latest.conclusion ?? "no result yet"}.` };
  return { pass: true, why: `agent-files passed at the head (run ${latest.id}, ${GUARD_WORKFLOW}, pull_request_target)` };
}

const gh = (...args) => execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const pages = (path) => JSON.parse(gh("--paginate", "--slurp", path)).flat();

/** Logins with write, maintain or admin access. A login whose check fails counts as no access. */
function writers(repo, logins) {
  const out = new Set();
  for (const login of logins) {
    try {
      const p = JSON.parse(gh(`repos/${repo}/collaborators/${login}/permission`));
      if (WRITE.has(p.permission) || WRITE.has(p.role_name)) out.add(login);
    } catch {
      console.error(`Couldn't check ${login}'s access, so their comment doesn't count.`);
    }
  }
  return out;
}

function fromApi(repo, pr, expected) {
  const pull = JSON.parse(gh(`repos/${repo}/pulls/${pr}`));
  const head = pull.head.sha;
  const changed = changedPaths(pages(`repos/${repo}/pulls/${pr}/files`));
  const stack = existsSync("docs/stack.md") ? readFileSync("docs/stack.md", "utf8") : "";
  const needComments = changed.some((p) => RULE_FILES.test(p)) && level(stack) === "full";
  const comments = needComments ? pages(`repos/${repo}/issues/${pr}/comments`) : [];
  const voters = [...new Set(comments.filter((c) => verdictOf(c.body, head)).map((c) => c.user?.login).filter(Boolean))];
  const labels = pages(`repos/${repo}/issues/${pr}/labels`).map((l) => l.name);
  return { changed, stack, comments, head, labels, trusted: writers(repo, voters), expected: expected || null, total: pull.changed_files };
}

/** The head's agent-files check runs, each with the workflow file and event that made it. */
function runsFromApi(repo, pr) {
  const head = JSON.parse(gh(`repos/${repo}/pulls/${pr}`)).head.sha;
  const checks = JSON.parse(gh("--paginate", "--slurp", `repos/${repo}/commits/${head}/check-runs?check_name=agent-files`)).flatMap((p) => p.check_runs);
  return checks.map((c) => {
    const run = JSON.parse(gh(`repos/${repo}/actions/runs?check_suite_id=${c.check_suite.id}`)).workflow_runs?.[0] ?? {};
    return { id: c.id, status: c.status, conclusion: c.conclusion, path: run.path ?? "(not a workflow run)", event: run.event ?? null };
  });
}

function fromFlags(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const read = (name, fallback) => (flag(name) ? readFileSync(flag(name), "utf8") : fallback);
  const list = (name) => (flag(name) ?? "").split(",").filter(Boolean);
  return {
    changed: changedPaths(JSON.parse(read("--files", "[]"))),
    stack: read("--stack", ""),
    comments: JSON.parse(read("--comments", "[]")),
    labels: list("--labels"),
    head: flag("--head") ?? "",
    trusted: new Set(list("--trusted")),
    expected: flag("--expected") ?? null,
    total: flag("--total") ? Number(flag("--total")) : null,
  };
}

export function main(argv, env = process.env) {
  let r;
  if (argv[0] === "verify-run") {
    r = argv.includes("--runs") ? verifyRuns(JSON.parse(readFileSync(argv[argv.indexOf("--runs") + 1], "utf8"))) : verifyRuns(runsFromApi(argv.includes("--repo") ? argv[argv.indexOf("--repo") + 1] : env.REPO, argv[1]));
  } else {
    const pr = argv.includes("--pr") ? argv[argv.indexOf("--pr") + 1] : null;
    r = decide(pr ? fromApi(env.REPO, pr, env.HEAD_SHA) : fromFlags(argv));
  }
  (r.pass ? console.log : console.error)(r.why);
  return r.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
