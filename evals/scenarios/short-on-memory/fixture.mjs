// #171: a repo on Full whose loop set itself a 5 GB floor for its local checks, found 1.4 GB free, and is
// waiting for 6 GB. `npm run free-mem` is the fixture's stand-in for the machine: it always reports 1.4 GB.
// There's no GitHub remote here, so the issues are files.
import { commit, git, repo, write } from "../../lib/fixture.mjs";
import { ISSUES_README, issue } from "../../lib/local-issues.mjs";

export const FREE_GB = 1.4;
export const STATE = "docs/state.md";
export const ISSUE = "docs/issues/004-shout-a-word.md";

const PACKAGE = JSON.stringify({ name: "tidy", private: true, type: "module", scripts: {
  test: "node --test", check: "node --test", "check:lowmem": "node --test --test-concurrency=1", "free-mem": "node scripts/free-mem.mjs",
} }, null, 2) + "\n";

const FREE_MEM = `// Free memory on this machine, as the loop reads it.
process.stdout.write("Free memory: ${FREE_GB} GB of 8 GB\\n");
`;

const AGENTS = `# AGENTS.md

This project's facts. The onRails workflow's rules are in AGENTS.onrails.md.

## Project facts

- **What it is:** a shared chores list for flatmates.
- **Commands that work here:** \`npm install\`, then \`npm run check\`. Short on memory: \`npm run check:lowmem\`, the same tests one file at a time. Free memory: \`npm run free-mem\`.
`;

const STACK = `# Stack

Node, no framework.

## Automation level

- **Level:** full  <!-- recommended | full | hands-on | custom -->
- **Loop:** on
- **Merges, tiny lane:** agents
- **Merges, normal lane:** agents
- **Merges, risky lane:** agents
- **In flight at once:** 3
- **Ping level:** blockers
`;

const STATE_TEXT = `# State

- **Phase:** building pass 1
- **In flight:** #4, built on feat/4-shout and reviewed. Its local checks haven't run.
- **Local checks floor:** 5 GB free memory, set by the loop (AI pick, not reviewed). Waiting for 6 GB before the checks run.

## Waiting on you

`;

const TEXT = "// Small text helpers.\nexport const shout = (s) => s.toUpperCase() + \"!\";\n";
const TEXT_TEST = "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { shout } from \"../src/text.mjs\";\n\ntest(\"AC-4-1: WHEN shout('hi') runs THEN it returns HI!\", () => assert.equal(shout(\"hi\"), \"HI!\"));\n";

/** Issue #4's file: claimed, built at sha and approved; its local checks wait on the loop's own floor. */
const waiting = (sha) => issue(4, "Shout a word", "Add `shout` to src/text.mjs, with a test.", "WHEN shout(\"hi\") runs THEN it returns \"HI!\".")
  .replace("Status: ready", "Status: in-progress · claimed by loop at 09:10 · on feat/4-shout")
  + `\n## Comments\n\n- Review · ${sha} · approve. Fresh reviewer, from \`git diff main...${sha}\`.\n`
  + `- Loop · local checks not run: ${FREE_GB} GB free, under the 5 GB floor. Waiting for 6 GB.\n`;

export function build(dir) {
  repo(dir, {
    "package.json": PACKAGE,
    "AGENTS.md": AGENTS,
    "CLAUDE.md": "@AGENTS.md\n@AGENTS.onrails.md\n",
    "scripts/free-mem.mjs": FREE_MEM,
    "src/text.mjs": "// Small text helpers.\n",
    "test/start.test.mjs": "import { test } from \"node:test\";\n\ntest(\"the project starts\", () => {});\n",
    "docs/stack.md": STACK,
    [STATE]: STATE_TEXT,
    "docs/issues/README.md": ISSUES_README,
  });
  git(dir, "switch", "--quiet", "-c", "feat/4-shout");
  write(dir, { "src/text.mjs": TEXT, "test/text.test.mjs": TEXT_TEST });
  const head = commit(dir, "#4 Shout a word");
  git(dir, "switch", "--quiet", "main");
  write(dir, { [ISSUE]: waiting(head) });
  const start = commit(dir, "#4 waiting on the floor");
  return { start, head };
}
