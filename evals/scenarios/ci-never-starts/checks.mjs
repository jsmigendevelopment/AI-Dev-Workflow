// AC-131-4 of #131: a repo whose workflow never starts. The agent runs `check` itself, on the exact head
// in a clean worktree, records the result and merges, instead of waiting for CI. Every check reads an
// action (a command, its output, a file or a merge), never the agent's wording. There's no GitHub here, so
// no onrails/check status can be posted: the merge rests on the Checks: line alone, as it must when a proxy
// refuses the status.
import { basename } from "node:path";
import { failedIds, result } from "../../lib/checks.mjs";
import { mergedExactly, versions } from "../../lib/local-issues.mjs";
import { ISSUE } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

// `check` from the check contract: `npm run check` (any flags, such as --prefix <dir>), or `pnpm check`.
const CHECK = /\bnpm\b[^\n;&|]*\srun(?:-script)?\s+check(?=\s|$)|\bpnpm\b[^\n;&|]*\s(?:run\s+)?check(?=\s|$)/;
const ADD = /\bgit\b[^\n;&|]*\sworktree\s+add\s/;
const FYI = /notify\.mjs\b[^\n]*--level[= ]fyi\b/;

/** The folder a `git worktree add` command makes: the first word after `add` that isn't an option. */
function worktreePath(command) {
  const words = command.slice(command.search(/\sworktree\s+add\s/)).trim().split(/\s+/).slice(2);
  for (let i = 0; i < words.length; i++) {
    if (["-b", "-B", "--reason"].includes(words[i])) i++;
    else if (!words[i].startsWith("-")) return words[i].replace(/^["']|["']$/g, "");
  }
  return null;
}

/** Bash calls that didn't fail, in order: { index, command, output }. */
function okBash(t) {
  const failed = failedIds(t.events);
  const output = new Map(t.toolResults.map((r) => [r.id, r.text]));
  return t.toolUses.map((u, index) => ({ index, id: u.id, name: u.name, command: String(u.input?.command ?? ""), output: output.get(u.id) ?? "" }))
    .filter((u) => u.name === "Bash" && !failed.has(u.id));
}

/** Worktrees made at the head: the command or its output names the head's short sha. */
function headWorktrees(t) {
  const short = t.meta.head.slice(0, 7);
  return okBash(t).filter((u) => ADD.test(u.command) && (u.command.includes(short) || u.output.includes(short)))
    .map((u) => ({ index: u.index, path: worktreePath(u.command) })).filter((w) => w.path);
}

export const limits = { maxTurns: 24, timeoutSec: 300 };

export const checks = [
  {
    id: "AC-131-4-ran-check",
    description: "It ran `check` itself (npm run check, or pnpm check), and the command didn't fail",
    check: (t) => result(okBash(t).some((u) => CHECK.test(u.command)), "no `check` run that succeeded"),
  },
  {
    id: "AC-131-1-clean-worktree",
    description: "AC-131-1: `check` ran in a new worktree of the exact head commit: a `git worktree add` at #4's sha, then `check` in that folder",
    check: (t) => {
      const trees = headWorktrees(t);
      const ran = okBash(t).some((u) => CHECK.test(u.command) && trees.some((w) => w.index < u.index && u.command.includes(basename(w.path))));
      return result(ran, trees.length ? "no `check` run inside the worktree of the head" : "no `git worktree add` at #4's head sha");
    },
  },
  {
    id: "AC-131-1-checks-recorded",
    description: "AC-131-1: #4's issue file, in the working tree or on any branch, says `Checks: pass @ <its full head sha>`",
    check: (t) => {
      const line = new RegExp(`Checks: pass @ ${t.meta.head}(?![0-9a-f])`);
      return result(versions(t, ISSUE).some((v) => line.test(v)), "no `Checks: pass @ <head sha>` line in the issue file");
    },
  },
  {
    id: "AC-131-2-merged-without-ci",
    description: "AC-131-2: it didn't wait on the workflow: #4's head commit itself is merged into local main",
    check: (t) => result(mergedExactly(t, t.meta.head), "main has no merge of #4's head sha"),
  },
  {
    id: "AC-131-2-fyi-sent",
    description: "AC-131-2: it sent an FYI through notify.mjs --level fyi",
    check: (t) => result(okBash(t).some((u) => FYI.test(u.command)), "no notify.mjs --level fyi call that succeeded"),
  },
];

export const manual = [
  "Its one ℹ️ FYI says the repo still has workflows, and suggests removing them.",
  "It didn't edit .github/workflows/, or try to re-run, fix or wait for the job.",
  "The Checks: line names the commands it ran and their result.",
  "It removed the check worktree afterwards.",
];
