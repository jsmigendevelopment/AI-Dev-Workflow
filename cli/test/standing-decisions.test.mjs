// #143: the person's recorded decisions outrank a skill's default gate, and a brief that hands on the loop
// carries them word for word. These rules are text the agents read, so the tests read the text: in the kit
// repo's AGENTS.md, the copies the kit installs, and the skills. AC-1 and AC-2 are the opt-in eval
// decision-lifts-gate; AC-4 is in doctor.test.mjs and update.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const AGENTS = ["AGENTS.md", "cli/kit/files/core/AGENTS.md", "plugin/cli/kit/files/core/AGENTS.md"];

test("AC-143-3: WHEN the coordinator hands the loop to a sub-agent THEN the brief quotes the automation level and the lifting decisions", () => {
  const coordinate = read(".agents/skills/coordinate/SKILL.md");
  assert.match(coordinate, /\*\*Handing on the loop itself\*\* \(you start a coordinator in another thread or a sub-agent\): its brief quotes the Level line from `docs\/stack\.md` and every decision row that lifts a gate, word for word/);
  const handoffs = read(".agents/skills/ask/references/handoffs.md");
  assert.match(handoffs, /^\s+Automation level: <the "Automation level" section's Level line from docs\/stack\.md/m);
  assert.match(handoffs, /^\s+Standing decisions: <every row in docs\/decisions\.md that lifts a gate or says not to wait, copied whole with its number>/m);
  assert.match(handoffs, /A summary like "on Full, don't wait" doesn't count/);
  for (const file of AGENTS) {
    assert.match(read(file), /A brief that hands on the loop also quotes the automation level and every decision row that lifts a gate, word for word\./, file);
  }
});

test("#143 item 1: rule 16 says recorded decisions outrank a skill's gate, in every AGENTS.md, and rule numbers stay unique", () => {
  for (const file of AGENTS) {
    const text = read(file);
    assert.match(text, /^16\. \*\*The person's recorded decisions outrank a skill's default gate\.\*\*.*Before any ⏳ or 🛑 ask, search both.*`Covered by decision <n>`.*always-stop list needs a decision that names it\./m, file);
    const rules = text.slice(text.indexOf("## Standing rules"), text.indexOf("## Code")).match(/^\d+(?=\. )/gm).map(Number);
    assert.deepEqual(rules, rules.map((_, i) => i + 1), `${file}: rules numbered 1 to ${rules.length}, each once`);
  }
});

test("#143 item 2: ask's step 0 searches decisions.md and stack.md before any ask, and cites the row", () => {
  const ask = read(".agents/skills/ask/SKILL.md");
  const steps = ask.slice(ask.indexOf("## Steps"));
  assert.match(steps, /^0\. \*\*Is it already answered\?\*\*.*docs\/decisions\.md docs\/stack\.md/m);
  assert.match(steps, /Don't ask\. Write `Covered by decision <n>: "<the row's words>"`/);
  assert.ok(steps.indexOf("0. **Is it already answered?**") < steps.indexOf("1. **Pick the level**"), "step 0 comes before picking a level");
});

test("#143 item 3: coordinate's agent-file rule reads the level first; on Full or under a lifting decision no person merges", () => {
  const rules = read(".agents/skills/coordinate/SKILL.md").split("## Rules")[1];
  assert.match(rules, /\*\*A pull request that changes the agents' rules or check code\*\*.*Read the automation level first/);
  assert.match(rules, /\*\*On Full:\*\* no person\. Run the weakening review/);
  assert.match(rules, /\*\*Below Full, with a decision row the person made that lifts this gate\*\*.*the same, no person/);
  assert.match(read(".agents/skills/coordinate/references/local-mode.md"), /On Full, or under a decision row that lifts the gate, merge on a `Weakening review: pass @ <sha>` line/);
});
