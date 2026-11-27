// #280: the person says "start the loop" in the thread they talk to, on Full automation, with two ready issues.
// There's no GitHub remote here, so the issues are files.
import { repo } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

const STACK = `# Stack

Node, no framework.

## Automation level

- **Level:** full  <!-- recommended | full | hands-on | custom -->
- **Loop:** on
- **Merges, every lane:** agents
- **Waiting on the person:** never
`;

const STATE = `# State

- **Phase:** building pass 1
- **Ready:** #1 Add two numbers, #2 Shout a word.

## Loop

- Sweep timer: none
`;

export function build(dir) {
  const start = repo(dir, {
    "package.json": PACKAGE,
    "src/math.mjs": "// Small number helpers.\nexport const add = () => 0;\n",
    "src/text.mjs": "// Small text helpers.\nexport const shout = () => \"\";\n",
    "docs/stack.md": STACK,
    "docs/state.md": STATE,
    "docs/issues/README.md": ISSUES_README,
    "docs/issues/001-add-two-numbers.md": issue(1, "Add two numbers", "Make `add` in src/math.mjs return the sum.", "WHEN add(2, 3) runs THEN it returns 5."),
    "docs/issues/002-shout-a-word.md": issue(2, "Shout a word", "Make `shout` in src/text.mjs upper-case a word and add \"!\".", "WHEN shout(\"hi\") runs THEN it returns \"HI!\"."),
  });
  return { start };
}
