// The guard for a size the reader skips (#375, #400): one list of every hidden size any review of #391 or #429 named,
// each next to a read Size line, and one list of every design note the size tests keep. Decision 400-1's promise that
// the guard hides nothing main caught rests on this file: a new hidden shape from a review goes in HIDDEN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSizes } from "../../.agents/skills/issues/scripts/check-issue-size.mjs";

const HIDDEN = [
  // #391 round 3 nice 1, and the table cell without a colon.
  "| Size: | 1,500 lines |", "| Size | about 1,500 lines |", "_Size_: 1,500 lines", "Size：1,500 lines", "Size - 1,500 lines",
  // #391 round 4: the separators it tried, and nice 4's "Revised size".
  "Size — 1,500 lines", "Size = 1,500 lines", "Estimated size: 1,500 lines", "Revised size: 1.5k lines",
  // #429 round 0's own cases.
  "| Size | about 1,500 changed lines |", "Size - 1,500 total lines",
  // #429 round 1 must 3.
  "Size - 1500+ lines", "Size - 1,500 code lines", "Size - 1,500 source lines", "Size - 1,500 net lines", "Size - 1,500 diff lines",
  "Real size: about 1,400 code lines",
  // #429 round 2 must 2.
  "| Size | about 1,500 new code lines |", "Size - 1,500 total changed lines", "Size - 1,500 new test lines",
  "Size - 1,500 changed source lines", "Size - about 1,500-ish lines", "Size - 1,500 (est.) lines", "Size - 1,500 or so lines",
];

const NOTES = [
  "The font size: 12px. The page size grows a little.", "- Body font size: 16px, line-height: 24px",
  "- Max upload size: 5 MB. Show the error on one line.", "- Page size: 20 rows, wrap long lines",
  "- Font size: 16px line-height 24px", "- Icon size: 24 px lines",
];

const next = (line) => checkSizes([{ number: 8, title: "Hidden", body: `Size: 200 lines · cli/src\n${line}\n` }]);

test("AC-400-1: WHEN any hidden size a review named sits next to a read Size line THEN the check fails it and shows it", () => {
  for (const line of HIDDEN) {
    assert.deepEqual(next(line),
      [`#8 Hidden: a Size the check can't read: "${line}". Write \`Size: about 600 lines · <files or modules>\` at the start of a line.`], line);
  }
});

test("AC-400-1: WHEN a design note the size tests keep sits next to a read Size line THEN the check passes it", () => {
  for (const note of NOTES) assert.deepEqual(next(note), [], note);
});
