// #254: `/back` on Full asked, left the retro's issues for the person and didn't restart the loop. The top-of-skill
// override lost to the steps below it, so each step that asks now has its own On Full branch, and a scan keeps it so.
// AC-254-1 is the opt-in eval back-on-full (evals/test/back-on-full.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mdFiles, scan, steps, unbranched } from "./full-branch-scan.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const BACK = read(".agents/skills/back/SKILL.md");
/** The step of `back` that starts with `prefix`. */
const step = (prefix) => {
  const found = steps(BACK).find((s) => s.text.startsWith(prefix));
  assert.ok(found, `found ${prefix}`);
  return found.text;
};
// The skills on the loop's path. The rest of the kit is #260.
const SCANNED = [".agents/skills/back", ".agents/skills/afk", ".agents/skills/coordinate"];

test("AC-254-2: WHEN a skill line asks, waits, offers or says the person picks THEN the check fails, unless the same step has an On Full branch", () => {
  // The lines that let /back ask on Full, as they were on main before #254.
  const asks = [
    "4. **Who else is working?** Look for claims and branches, then ask: *\"Is anyone else working on this repo right now?\"*",
    "8. **Triage.** Offer three options with your pick first:",
    "   - **A problem in this app:** open an issue here. Don't add `status:ready`. The person picks it.",
    "   - **A flaw in the kit itself:** draft an issue. **Never file it there without their yes.**",
    "   Offer to start the dev server too, so they can try things locally.",
    "Anything that needs the person waits for them.",
    "8. **Triage.** Offer three options. On full automation and the app has real users? Suggest Recommended.",
    "- **Codex:** ask the person to check their usage page (on Full too).",
    // Missed by the first scan (#261 review, round 1): a word between "wait" and "for", "offer once", a bare "Ask,".
    "  - write the final state with its findings to `docs/state.md`, and stop. Kit drafts wait there for the person.",
    "**No sheet yet?** Offer once: *\"Want your board as a Google Sheet?\"* On a yes, create a spreadsheet.",
    "1. **How long?** Ask, or read it from what the person said (\"going to lunch\" is a short break).",
  ];
  for (const s of asks) assert.equal(unbranched(s).length, 1, s);
  // A branch in the same step passes. A branch in the parent step doesn't cover its child bullet.
  assert.deepEqual(unbranched("8. **Triage.** Below Full, offer three options and wait. On Full, it's a report line."), []);
  assert.deepEqual(unbranched("Never ask the person to free memory."), [], "a negated ask is no ask");
  const nested = "5. **Each finding.** On Full, nothing waits.\n   - **An app issue:** the person picks it.";
  assert.deepEqual(unbranched(nested).map((s) => s.line), [2]);
});

test("AC-254-2: WHEN the check reads back, afk and coordinate THEN every step that asks has its own On Full branch", () => {
  assert.deepEqual(scan(SCANNED.flatMap(mdFiles)), []);
});

test("AC-254-3: WHEN the level is Recommended THEN /back still offers triage and waits, as before", () => {
  const triage = step("8. **Triage.**");
  assert.match(triage, /Below Full, offer three options with your pick first, and wait for their choice\./);
  assert.match(step("Below Full, offer to start the dev server too"), /On Full, put the command that starts it in the report\./);
  assert.match(step("4. **Who else is working?**"), /Below Full, then ask: \*"Is anyone else, or any other agent, working on this repo right now\?"\*/);
  assert.match(step("- **A problem in this app**"), /Below Full, don't add `status:ready`: the person picks it\./);
  assert.match(step("- **A flaw in the kit itself**"), /Below Full, .*\*\*Never file it there without their yes\.\*\* On a yes: `gh issue create/);
  assert.match(step("11. **On Full, start the loop again.**"), /Below Full, the loop starts when the person picks it in step 8\./);
});

test("#254 items 1 and 2: on Full each step is a pick, and starting the loop is the last numbered step", () => {
  assert.match(step("8. **Triage.**"), /On Full, it's a report line, not a question/);
  assert.match(step("4. **Who else is working?**"), /On Full, don't ask: state what you found in the report/);
  assert.match(step("- **A problem in this app**"), /On Full, add `status:ready` and a priority, so the loop builds it\./);
  assert.match(step("- **A flaw in the kit itself**"), /On Full, file it now with that command .*never as waiting on the person\./);
  const loop = step("11. **On Full, start the loop again.**");
  assert.match(loop, /hasn't said pause or stop\? Start `coordinate` now, as the last thing `\/back` does/);
  assert.match(loop, /\*\*Done when\*\* the timer is armed or a live loop was found/);
  const numbered = steps(BACK.slice(0, BACK.indexOf("## Retro"))).filter((s) => /^\d+\. /.test(s.text));
  assert.ok(numbered.at(-1).text.startsWith("11. **On Full, start the loop again.**"), "the loop is the last step");
});
