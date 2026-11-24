// Planning is done and two tiny, independent issues are ready. There's no GitHub remote, so the
// issues are files. The last thing the agent said was "ready for your go-ahead to start issue 1".
import { repo } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

const STATE = `# State

- **Phase:** pass 1 planned, issues written. Building next.
- **Next up:** issue #1, then #2. Both are ready and independent.
- **Last said to the person:** "The plan is done. Ready for your go-ahead to start issue 1."

## Waiting on you

`;

export function build(dir) {
  const start = repo(dir, {
    "package.json": PACKAGE,
    "src/math.mjs": "// Small number helpers.\n",
    "src/text.mjs": "// Small text helpers.\n",
    "docs/stack.md": "# Stack\n\nNode, no framework.\n\n## Automation level\n\nFull automation. Loop: on. Merges: agents, every lane. In flight at once: 3.\n",
    "docs/state.md": STATE,
    "docs/issues/README.md": ISSUES_README,
    "docs/issues/1.md": issue(1, "Add two numbers", "Add `export const add = (a, b) => a + b;` to src/math.mjs, with a test.",
      "WHEN add(2, 3) runs THEN it returns 5."),
    "docs/issues/2.md": issue(2, "Shout a word", "Add `export const shout = (s) => s.toUpperCase() + \"!\";` to src/text.mjs, with a test.",
      "WHEN shout(\"hi\") runs THEN it returns \"HI!\"."),
  });
  return { start };
}
