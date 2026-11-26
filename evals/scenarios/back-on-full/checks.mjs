// AC-1 of #254: /back on Full with ready work left. Every check reads an action: a tool call, a command or a file.
// The agent calls no ask tool, starts the loop, files the retro's app issue as ready and leaves no kit lesson on a yes.
import { failedIds, questionLines, result } from "../../lib/checks.mjs";
import { built, versions } from "../../lib/local-issues.mjs";
import { STATE } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 40, timeoutSec: 600 };

// A tool whose job is to ask the person, as in one-prompt.
const ASK_TOOL = /^AskUserQuestion$|ask.*(?:user|question|human)|user.?input|confirm/i;
// A call that arms a timer, as in go-ahead-loop: /loop, a scheduled wake-up or task, send_later.
const timerCall = (u) => /schedulewakeup|cron|send_later|create_trigger/i.test(u.name)
  || (u.name === "Skill" && /^loop\b/.test(String(u.input?.skill ?? "")));
const ARMED = /\btimer\.mjs\b[^\n]*\sarmed\s/;
// Something left on the person's yes: "needs your yes", "with your ok", "want me to file it".
const ON_A_YES = /\b(?:your|their|the person.s) (?:yes|ok|okay|go-ahead|approval)\b|\b(?:want me to|shall i|should i) file\b/i;
const READY = /^Status:\s*(?:ready|in-progress)\b|\bstatus:ready\b/im;

/** Bash commands that didn't fail. */
const okBash = (t) => {
  const failed = failedIds(t.events);
  return t.toolUses.filter((u) => u.name === "Bash" && !failed.has(u.id)).map((u) => String(u.input?.command ?? ""));
};

/** Issue files new since the fixture's start, on any branch or in the working tree, with their text. */
function newIssues(t) {
  const md = (out) => out.split("\n").filter((p) => /^docs\/issues\/\d+.*\.md$/.test(p));
  const added = md(t.git("ls-files", "--others", "--exclude-standard", "--", "docs/issues"));
  const committed = md(t.git("log", "--all", "--diff-filter=A", "--name-only", "--format=", `^${t.meta.start}`, "--", "docs/issues"));
  return [...new Set([...added, ...committed])].map((path) => versions(t, path).filter(Boolean).at(-1) ?? "");
}

/** The "Waiting on you" section of each version of docs/state.md. */
const waiting = (t) => versions(t, STATE).map((s) => s.split(/^## Waiting on you\s*$/m)[1]?.split(/^## /m)[0] ?? "");

export const checks = [
  {
    id: "AC-254-1-no-ask-tool",
    description: "No AskUserQuestion, or any other tool that asks the person, was called",
    check: (t) => {
      const asks = t.toolUses.filter((u) => ASK_TOOL.test(u.name)).map((u) => u.name);
      return result(asks.length === 0, `called ${asks[0]}`);
    },
  },
  {
    id: "AC-254-1-no-question",
    description: "The final message asks nothing: no triage offer, no who-else question",
    check: (t) => {
      const asks = questionLines(t.finalText);
      return result(asks.length === 0, `asked: ${asks[0]}`);
    },
  },
  {
    id: "AC-254-1-loop-started",
    description: "The loop started: a timer-arming call, a timer.mjs armed that didn't fail, or work on ready issue #5",
    check: (t) => result(t.toolUses.some(timerCall) || okBash(t).some((c) => ARMED.test(c)) || built(t, 5), "no timer armed and no work on #5"),
  },
  {
    id: "AC-254-1-retro-issue-ready",
    description: "The retro filed at least one new issue file, and every new one is ready (Status: ready or in-progress, or status:ready)",
    check: (t) => {
      const issues = newIssues(t);
      if (!issues.length) return result(false, "no new issue file in docs/issues/");
      return result(issues.every((text) => READY.test(text)), "a new issue is not ready");
    },
  },
  {
    id: "AC-254-1-kit-lesson-not-waiting",
    description: "No kit lesson waits on the person: nothing in docs/state.md's Waiting on you, and no yes asked for in it or the final message",
    check: (t) => {
      const parked = waiting(t).find((w) => /\bkit\b|onRails|draft/i.test(w));
      if (parked) return result(false, `waiting on you: ${parked.trim().split("\n")[0]}`);
      const yes = [t.finalText, ...versions(t, STATE)].join("\n").split("\n").find((l) => ON_A_YES.test(l));
      return result(!yes, `on a yes: ${yes}`);
    },
  },
];

export const manual = [
  "The report says what it found about other sessions, instead of asking who else is working.",
  "The kit finding (check:merge missing) was drafted or filed, and listed in the FYI.",
  "The report names its triage pick as a line, and the loop was the last thing it started.",
];
