// #390: the thread the person talks to only talks. Merges, builds, checks and waits go to a background sub-agent or
// sub-thread, so the person is never blocked. The behaviour is the opt-in eval live-thread-only-talks
// (evals/test/live-thread-only-talks.test.mjs); these tests pin the rule's text where the live thread reads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const skill = (name) => read(`.agents/skills/${name}/SKILL.md`);
/** The text of the `## heading` section of a markdown file, up to the next `## `. */
const section = (text, heading) => {
  const found = text.split(/^## /m).find((s) => s.startsWith(heading));
  assert.ok(found, `found ## ${heading}`);
  return found;
};
/** The standing rule whose bold title starts with `title`, with its sub-bullets. */
const rule = (title) => {
  const rules = section(read("AGENTS.md"), "Standing rules").split(/^(?=\d+\. )/m);
  const found = rules.find((r) => r.match(/^\d+\. \*\*([^*]+)\*\*/)?.[1].startsWith(title));
  assert.ok(found, `a standing rule "${title}"`);
  return found;
};

test("AC-390-1: WHEN AGENTS.md is read THEN a standing rule says the live thread only talks and hands the rest down", () => {
  const r = rule("The live thread only talks");
  assert.match(r, /answers, records the person's decisions, writes a note or files an issue, and hands work down/);
  assert.match(r, /never builds, reviews, merges, deploys, runs the checks, runs long installs or tests, or waits on anything/);
  assert.match(r, /background sub-agent or sub-thread/);
  assert.match(r, /changes a repo, any command over about 30 seconds and any wait/);
  assert.match(r, /\*\*Quick reads are fine\*\*/);
  assert.match(r, /long read goes to a sub-agent[^\n]*when it will report back/);
  assert.match(r, /\*\*Never block the person\.\*\*[^\n]*answer right away[^\n]*pass (?:their|the) words down/);
});

test("AC-390-1: WHEN coordinate starts in the live thread THEN a job the person names goes down and the turn ends", () => {
  const where = section(skill("coordinate"), "Where this runs");
  assert.match(where, /only talks \(rule 17/);
  assert.match(where, /\*\*A job the person names\*\*[^\n]*"merge #12"[^\n]*the loop[^\n]*background sub-agent[^\n]*end your turn/);
});

test("AC-390-2: WHEN the person speaks while the loop or a sub-agent works THEN the live thread answers right away", () => {
  const where = section(skill("coordinate"), "Where this runs");
  assert.match(where, /Answer the person right away, whatever the loop is doing/);
  const handoffs = section(skill("ask"), "Handoffs");
  assert.match(handoffs, /\*\*In the live thread\*\* \(rule 17\)[^\n]*never waits for the receipt[^\n]*answer the person's next message right away/);
});

test("AC-390-1: WHEN back, afk and automation run in the live thread THEN their long steps go to a background sub-agent", () => {
  assert.match(skill("back"), /\*\*This is the live thread\*\* \(rule 17 in `AGENTS\.md`\)[^\n]*retro \(step 7\)[^\n]*background sub-agent/);
  const afk = skill("afk");
  assert.match(afk, /Run "Check main"[^\n]*in a background sub-agent \(rule 17\)/);
  assert.doesNotMatch(afk, /Missing, older or a fail\? Run "Check main" in `coordinate` step 8 first\./);
  const steps = section(skill("automation"), "Steps");
  assert.match(steps, /background sub-agent opens the pull request \(rule 17\)/);
  assert.doesNotMatch(steps, /Commit it through a pull request like any change\./);
});
