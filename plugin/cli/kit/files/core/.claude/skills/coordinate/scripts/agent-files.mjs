#!/usr/bin/env node
// CI's agent-files guard. A pull request that changes the agents' rules or check code passes with
// the `human-approved` label. On Full automation it also passes on the weakening review (#103): a
// comment from someone with write access that says exactly
//   Weakening review: pass @ <full head sha>
// The level comes from docs/stack.md at the BASE commit, and CI runs this file from the base commit
// too, so a pull request can't switch on Full or change the guard for itself.
// CI: env BASE, HEAD, LABELS, REPO, PR (and GH_TOKEN for `gh api`). No dependencies.
// Tests: --changed <file> --stack <file> --comments <json file> --labels a,b --head <sha>
// Exit 0 passes, 1 fails.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Paths that change the agents' rules or the checks. */
export const RULE_FILES = /^(AGENTS\.md|CLAUDE\.md|\.agents\/|\.claude\/|\.codex\/|\.github\/)/;
// GitHub's author_association values for people with write access to the repo.
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const PASS = /^Weakening review: pass @ ([0-9a-f]{40})\s*$/m;

/** The automation level in a docs/stack.md text: "- **Level:** full". Recommended when it's missing. */
export const level = (stack = "") => stack.match(/\*\*Level:\*\*\s*`?([a-z-]+)/i)?.[1].toLowerCase() ?? "recommended";

/** Pass or fail, and why. comments: [{ body, author_association }] from the GitHub API. */
export function decide({ changed = [], labels = [], stack = "", comments = [], head = "" }) {
  const rules = changed.filter((p) => RULE_FILES.test(p));
  if (!rules.length) return { pass: true, why: "no agent rule or check files changed" };
  if (labels.includes("human-approved")) return { pass: true, why: "the human-approved label" };
  const full = level(stack) === "full";
  if (full && comments.some((c) => TRUSTED.has(c.author_association) && c.body?.match(PASS)?.[1] === head)) {
    return { pass: true, why: `the weakening review passed at ${head}` };
  }
  const need = full ? `a "Weakening review: pass @ ${head || "<head sha>"}" comment (Full automation), or the human-approved label`
    : "the human-approved label";
  return { pass: false, why: `These files change the agents' rules and need ${need}:\n${rules.join("\n")}` };
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const gitOr = (fallback, ...args) => { try { return git(...args); } catch { return fallback; } };

/** What CI gives: the changed paths, the base's stack.md, the comments, the labels and the head. */
function fromCi(env) {
  const changed = git("diff", "--name-only", `${env.BASE}...HEAD`).split("\n").filter(Boolean);
  const stack = gitOr("", "show", `${env.BASE}:docs/stack.md`);
  const needComments = changed.some((p) => RULE_FILES.test(p)) && level(stack) === "full";
  const comments = needComments
    ? JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${env.REPO}/issues/${env.PR}/comments`], { encoding: "utf8" })).flat()
    : [];
  return { changed, stack, comments, labels: (env.LABELS ?? "").split(",").filter(Boolean), head: env.HEAD ?? "" };
}

function fromFlags(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const read = (name, fallback) => (flag(name) ? readFileSync(flag(name), "utf8") : fallback);
  return {
    changed: read("--changed", "").split("\n").filter(Boolean),
    stack: read("--stack", ""),
    comments: JSON.parse(read("--comments", "[]")),
    labels: (flag("--labels") ?? "").split(",").filter(Boolean),
    head: flag("--head") ?? "",
  };
}

export function main(argv, env = process.env) {
  const r = decide(argv.includes("--changed") ? fromFlags(argv) : fromCi(env));
  (r.pass ? console.log : console.error)(r.why);
  return r.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
