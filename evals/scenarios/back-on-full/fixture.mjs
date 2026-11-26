// #254: the person is back after a night away, on Full automation. The loop's timer died overnight, #3 was parked
// on a flaky test (an app finding for the retro), the loop guessed past a missing kit command (a kit finding), and
// #5 is ready. There's no GitHub remote here, so the issues are files.
import { repo } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

export const STATE = "docs/state.md";

const STACK = `# Stack

Node, no framework.

## Automation level

- **Level:** full  <!-- recommended | full | hands-on | custom -->
- **Loop:** on
- **Merges, every lane:** agents
- **Waiting on the person:** never
`;

const STATE_TEXT = `# State

- **Phase:** building pass 1
- **Merged overnight:** #1 Add two numbers, #2 Shout a word (checked and passed).
- **Parked:** #3 Format a date. test/date.test.mjs failed twice, then passed: it reads the machine's time zone.
- **Ready:** #5 Count words.

## Loop

- Sweep timer: live · send_later · t1+wake01 · every 30 min · next 2026-11-26T01:00:00Z

## /afk

- Left 2026-11-25 22:00 UTC, for the night. Hard stop: none (Full).
- The loop ran \`npm run check:merge\`, as the kit's \`coordinate\` step 6.1.3 says, but this repo has no such script, so it guessed and ran \`npm run check\`. A flaw in the kit's step, not in this app.

## Waiting on you

`;

export function build(dir) {
  const start = repo(dir, {
    "package.json": PACKAGE,
    "src/math.mjs": "// Small number helpers.\nexport const add = (a, b) => a + b;\n",
    "src/text.mjs": "// Small text helpers.\nexport const shout = (s) => s.toUpperCase() + \"!\";\nexport const countWords = () => 0;\n",
    "docs/stack.md": STACK,
    [STATE]: STATE_TEXT,
    "docs/issues/README.md": ISSUES_README,
    "docs/issues/003-format-a-date.md": issue(3, "Format a date", "Add `formatDate` to src/date.mjs, with a test.", "WHEN formatDate(0) runs THEN it returns \"1970-01-01\".")
      .replace("Status: ready", "Status: parked · test/date.test.mjs fails in some time zones"),
    "docs/issues/005-count-words.md": issue(5, "Count words", "Make `countWords` in src/text.mjs count the words in a string.", "WHEN countWords(\"a b c\") runs THEN it returns 3."),
  });
  return { start };
}
