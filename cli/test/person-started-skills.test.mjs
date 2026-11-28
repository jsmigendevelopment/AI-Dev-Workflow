// #454: rule 17 (#390) reaches the skills a person can start in the thread they talk to. Started there, a skill hands
// its long work to a background sub-agent and the thread answers at once. A sub-agent briefed to run the skill does
// the work itself, so a builder or reviewer never hands its own job down again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
/** A skill's opening: the text after its front matter, up to its first `## ` heading. */
const opening = (name) => read(`.agents/skills/${name}/SKILL.md`).split(/^## /m)[0];

// The line each skill opens with when the person starts it in the live thread.
const HAND_DOWN = {
  build: /\*\*Started by the person in the live thread\*\* \(the thread they talk to, rule 17 in `AGENTS\.md`\)\?[^\n]*to the loop if one runs, else[^\n]*background sub-agent briefed[^\n]*`build`[^\n]*the person's words[^\n]*end the turn\./,
  "pr-review": /\*\*Started by the person in the live thread\*\* \(the thread they talk to, rule 17 in `AGENTS\.md`\)\?[^\n]*background sub-agent briefed[^\n]*`pr-review`[^\n]*end the turn[^\n]*verdict on when it reports back\./,
  qa: /\*\*Started by the person in the live thread\*\* \(the thread they talk to, rule 17 in `AGENTS\.md`\)\?[^\n]*background sub-agent briefed[^\n]*`qa`[^\n]*end the turn[^\n]*when it reports back\./,
  diagnose: /\*\*Started by the person in the live thread\*\* \(the thread they talk to, rule 17 in `AGENTS\.md`\)\?[^\n]*easy answer stays there[^\n]*background sub-agent briefed[^\n]*`diagnose`[^\n]*exact symptom[^\n]*end the turn[^\n]*when it reports back\./,
  research: /\*\*Started by the person in the live thread\*\* \(the thread they talk to, rule 17 in `AGENTS\.md`\)\?[^\n]*research thread in the background[^\n]*the person's words[^\n]*end the turn[^\n]*when it reports back\./,
  idea: /\*\*This is the live thread\*\* \(rule 17 in `AGENTS\.md`\)[^\n]*questions, the answers and the reports stay here[^\n]*background sub-agent and answer the person at once[^\n]*\(steps 9 and 10\)[^\n]*when it reports back[^\n]*One prompt on Full\?[^\n]*whole kickoff to one background sub-agent/,
  join: /\*\*This is the live thread\*\* \(rule 17 in `AGENTS\.md`\)[^\n]*questions, the answers and the reports stay here[^\n]*background sub-agent and answer the person at once[^\n]*\(step 2\)[^\n]*\(steps 1 and 3\)[^\n]*when it reports back/,
};
const DOES_IT_ITSELF = /\*\*Your brief came from another thread\?\*\* Never hand your own job down again: do it yourself, and start a sub-agent only where a step below says to\./;

test("AC-454-1: WHEN the person starts build, idea, join, pr-review, qa, diagnose or research in the live thread THEN its opening hands the long work to a background sub-agent and the thread answers at once", () => {
  for (const [name, line] of Object.entries(HAND_DOWN)) assert.match(opening(name), line, name);
});

test("AC-454-2: WHEN a sub-agent is briefed to run one of those skills THEN its opening says to do the work itself and not hand it down again", () => {
  for (const name of Object.keys(HAND_DOWN)) {
    const text = opening(name);
    assert.match(text, DOES_IT_ITSELF, name);
    assert.ok(text.indexOf("**Your brief came from another thread?**") > text.search(HAND_DOWN[name]), `${name}: the sub-agent line follows the live-thread line`);
  }
});

test("AC-454-3: WHEN a pause or stop is proved THEN the loop's own list is shown when it reports back, never waited on", () => {
  const ask = read(".agents/skills/ask/SKILL.md");
  assert.match(ask, /`timer\.mjs status` if you or the loop armed a timer, and the loop's own list when it reports back; don't wait for it\./);
  const coordinate = read(".agents/skills/coordinate/SKILL.md");
  assert.match(coordinate, /\(`procs\.mjs list --mine`, `timer\.mjs status`, and the loop's own list when it reports back; don't wait for it\)\./);
});

test("AC-454-4: WHEN decision 390-1 is read THEN part (2) names afk's handed-down commit and back step 9's no inline fix", () => {
  const part2 = read("docs/decisions/390-1.md").match(/\(2\)[^]*?(?=\(3\))/)?.[0] ?? "";
  assert.match(part2, /`afk` \([^)]*commit of the state note goes to a background sub-agent[^)]*\)/);
  assert.match(part2, /`back` \([^)]*step 9 never fixes feedback inline[^)]*\)/);
});
