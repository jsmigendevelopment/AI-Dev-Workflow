#!/usr/bin/env node
// The agent-file guard, run by .github/workflows/agent-files.yml. A pull request that changes the
// agents' rules or check code passes with the `human-approved` label. On Full automation it also
// passes on the weakening review (#103): the latest verdict comment at the head commit, from
// someone with write access, is the line
//   Weakening review: pass @ <full head sha>
// The workflow runs from the default branch and this file from the base checkout, so a pull request
// can't change either. The level is read from docs/stack.md in that base checkout. The pull request's
// files, labels and comments are read through the API as data; none of its code runs.
// CI:    node agent-files.mjs --pr <n>   (env REPO, GH_TOKEN; needs `gh`)
// Tests: node agent-files.mjs --files <json> --stack <file> --comments <json> --labels a,b --head <sha> --trusted a,b
// Exit 0 passes, 1 fails. No dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Paths that change the agents' rules or the checks. */
export const RULE_FILES = /^(AGENTS\.md|CLAUDE\.md|\.agents\/|\.claude\/|\.codex\/|\.github\/)/;
const VERDICT = /^Weakening review: (pass|fail) @ ([0-9a-f]{40})\s*$/gm;
const WRITE = new Set(["admin", "maintain", "write"]);

/** The automation level in a docs/stack.md text: "- **Level:** full". Recommended when it's missing. */
export const level = (stack = "") => stack.match(/\*\*Level:\*\*\s*`?([a-z-]+)/i)?.[1].toLowerCase() ?? "recommended";

/** Every path a pull request touches, from the API's file list: a rename counts both names. */
export const changedPaths = (files) => files.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean));

/** A comment's verdict at this commit: "pass", "fail", or null. Both lines in one comment count as a fail. */
export function verdictOf(body = "", head) {
  const found = new Set([...body.matchAll(VERDICT)].filter((m) => m[2] === head).map((m) => m[1]));
  return found.has("fail") ? "fail" : found.has("pass") ? "pass" : null;
}

/** The latest verdict at the head commit from a trusted login. Comments: [{ body, user: { login }, updated_at }]. */
export function latestVerdict(comments, head, trusted) {
  const at = comments.filter((c) => trusted.has(c.user?.login) && verdictOf(c.body, head))
    .sort((a, b) => String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? "")));
  return at.length ? verdictOf(at.at(-1).body, head) : null;
}

/** Pass or fail, and why. */
export function decide({ changed = [], labels = [], stack = "", comments = [], head = "", trusted = new Set() }) {
  const rules = [...new Set(changed.filter((p) => RULE_FILES.test(p)))];
  if (!rules.length) return { pass: true, why: "no agent rule or check files changed" };
  if (labels.includes("human-approved")) return { pass: true, why: "the human-approved label" };
  const full = level(stack) === "full";
  const verdict = full ? latestVerdict(comments, head, trusted) : null;
  if (verdict === "pass") return { pass: true, why: `the weakening review passed at ${head}` };
  const need = full ? `a "Weakening review: pass @ ${head || "<head sha>"}" comment from someone with write access (Full automation), or the human-approved label`
    : "the human-approved label";
  const failed = verdict === "fail" ? `The weakening review failed at ${head}.\n` : "";
  return { pass: false, why: `${failed}These files change the agents' rules and need ${need}:\n${rules.join("\n")}` };
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

function fromApi(repo, pr) {
  const pull = JSON.parse(gh(`repos/${repo}/pulls/${pr}`));
  const head = pull.head.sha;
  const changed = changedPaths(pages(`repos/${repo}/pulls/${pr}/files`));
  const stack = existsSync("docs/stack.md") ? readFileSync("docs/stack.md", "utf8") : "";
  const needComments = changed.some((p) => RULE_FILES.test(p)) && level(stack) === "full";
  const comments = needComments ? pages(`repos/${repo}/issues/${pr}/comments`) : [];
  const voters = [...new Set(comments.filter((c) => verdictOf(c.body, head)).map((c) => c.user?.login).filter(Boolean))];
  return { changed, stack, comments, head, labels: pull.labels.map((l) => l.name), trusted: writers(repo, voters) };
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
  };
}

export function main(argv, env = process.env) {
  const pr = argv.includes("--pr") ? argv[argv.indexOf("--pr") + 1] : null;
  const r = decide(pr ? fromApi(env.REPO, pr) : fromFlags(argv));
  (r.pass ? console.log : console.error)(r.why);
  return r.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
