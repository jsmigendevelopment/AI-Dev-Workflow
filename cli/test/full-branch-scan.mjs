// #254: a step that asks, waits, offers or leaves work for the person needs its own "On Full" branch. The override at
// the top of a skill lost to the specific step below it, so the scan reads each step on its own.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, ROOT)), "utf8");

// Words that hand a step to the person. "never asks the person" or "don't ask them" says no ask happens.
const NOT = "(?<!\\b(?:never|don.t|doesn.t|not|nothing|no one) )";
export const HANDS_TO_PERSON = new RegExp(`${NOT}(?:${[
  "\\bthen ask\\b", "\\basks? (?:the person|them|the owner|which)\\b", "\\boffers? (?:three|two|one|to|once)\\b",
  "\\b(?:the person|they) picks?\\b", "\\bwithout (?:their|the person.s) yes\\b", "\\bneeds? (?:your|their|the person.s) yes\\b",
  "\\bwaits? (?:for|on) (?:the person|their|a yes|them)\\b", "\\bwaits? (?:\\w+ ){1,2}for (?:the person|them|their)\\b",
  "\\*\\*[^*]+\\*\\* Ask\\b",
].join("|")})`, "i");
// The step's own branch. "(on Full too)" keeps the person, so it isn't one. Lowercase "full automation" isn't either.
const ON_FULL = /\b[Oo]n Full\b(?!,? (?:too|as well)\b)/;

/**
 * A file's steps: each list item (at any depth), table row, heading or paragraph, with the lines that continue it.
 * A child bullet is its own step, so a branch in the parent doesn't cover it.
 */
export const steps = (text) => {
  const out = [];
  let cur = null;
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t) cur = null;
    else if (!cur || /^(?:[-*] |\d+\. |#|\|)/.test(t)) out.push((cur = { line: i + 1, text: t }));
    else cur.text += ` ${t}`;
  });
  return out;
};

/** The steps in `text` that hand something to the person with no On Full branch of their own. */
export const unbranched = (text) => steps(text).filter((s) => HANDS_TO_PERSON.test(s.text) && !ON_FULL.test(s.text));

// #260: the steps that need no On Full branch, because they are on the always-stop list (AGENTS.md; automation's
// references/full.md): production, paying, the person's own logins, real data after launch, stopping a running
// strongest-tier job. Each is [file, the words of its step, why]. The words must still match an unbranched step of
// that file, so an entry whose step moved, changed or gained a branch fails the test (unusedExceptions).
const ALWAYS_STOP = "always-stop list";
export const EXCEPTIONS = [
  ["AGENTS.md", "## Always stop and ask the person before", `the ${ALWAYS_STOP} itself`],
  ["plugin/cli/kit/files/core/AGENTS.md", "## Always stop and ask the person before", `the ${ALWAYS_STOP} itself, in the kit's copy`],
  [".agents/skills/idea/templates/stack.md", "production, secrets, real data and money always wait for the person.", `the ${ALWAYS_STOP} itself`],
  [".agents/skills/routing/SKILL.md", "Never stop or restart a strongest-tier run without the person's yes.", "stopping a running strongest-tier job: always-stop"],
  [".agents/skills/diagnose/SKILL.md", "no real data, settings, secrets, deploys or extra logging there without the person's yes.", "touching production: always-stop"],
  [".agents/skills/stack/SKILL.md", "Production changes are on the always-stop list: show the dry run, then ask.", "production settings: always-stop"],
  [".agents/skills/stack-monorepo-expo/SKILL.md", "cost money or touch production: stop and ask the person.", "paying and production: always-stop"],
  [".agents/skills/stack-tanstack-start/SKILL.md", "Wait for a yes: a production setting is on the always-stop list.", "production settings: always-stop"],
  [".agents/skills/stack-tanstack-start/SKILL.md", "Wait for a yes: going public is on the always-stop list.", "going public: always-stop"],
];

/** Every unbranched step in these files, as "file:line: text", less the steps `exceptions` name. */
export const scan = (files, exceptions = EXCEPTIONS) => files.flatMap((f) => unbranched(read(f))
  .filter((s) => !exceptions.some(([file, words]) => file === f && s.text.includes(words)))
  .map((s) => `${f}:${s.line}: ${s.text.slice(0, 120)}`));

/** The exceptions that name no unbranched step of their file any more: they hide nothing, so they go. */
export const unusedExceptions = (files, exceptions = EXCEPTIONS) => exceptions.filter(([file, words]) =>
  !files.includes(file) || !unbranched(read(file)).some((s) => s.text.includes(words)));

/** The .md files under a repo folder. */
export const mdFiles = (dir) => readdirSync(fileURLToPath(new URL(dir, ROOT)), { recursive: true })
  .filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f.replaceAll("\\", "/")}`);

// #260: the whole skills folder, so a new skill is scanned the day it lands.
export const SCANNED = [".agents/skills"];
// The other files the loop reads, named one by one so a moved file fails the test (read throws) instead of dropping out.
// The hooks in .claude/hooks print no kit .md: they read the app's docs/state.md and docs/stack.md.
export const NAMED = [
  "AGENTS.md", "plugin/cli/kit/files/core/AGENTS.md",
  ".agents/skills/coordinate/board.md", ".agents/skills/coordinate/references/insights.md",
  ".agents/skills/coordinate/references/local-mode.md", ".agents/skills/coordinate/references/size-send-back.md",
  ".agents/skills/automation/references/full.md",
  ".agents/skills/build/references/app-conventions-go.md", ".agents/skills/build/references/app-conventions.md",
  ".agents/skills/build/references/code-style.md", ".agents/skills/build/references/testing.md",
  ".agents/skills/ask/references/handoffs.md", ".agents/skills/ask/references/preflight.md", ".agents/skills/ask/references/voice.md",
  ".agents/skills/pr-review/SKILL.md", ".agents/skills/pr-security/SKILL.md", ".agents/skills/qa/SKILL.md", ".agents/skills/diagnose/SKILL.md",
  ".agents/skills/stack-tanstack-start/SKILL.md", ".agents/skills/stack-tanstack-start/references/cloudflare-agent-setup.md",
  ".agents/skills/stack-monorepo-expo/SKILL.md",
];
