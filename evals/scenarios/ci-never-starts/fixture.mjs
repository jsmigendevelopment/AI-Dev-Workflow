// #131: a repo whose GitHub Actions workflow never starts (a billing error). Issue #4 is built on its
// branch and approved by a fresh reviewer. There's no GitHub remote here, so the issues are files, and
// the CI result is copied into the issue file as the reviewer saw it on GitHub.
import { commit, git, repo, write } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

const CI = `name: ci
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run check
`;

const BILLING = "The job was not started because recent account payments have failed or your spending limit needs to be increased.";

const SHOUT = "// Small text helpers.\nexport const shout = (s) => s.toUpperCase() + \"!\";\n";
const SHOUT_TEST = "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { shout } from \"../src/text.mjs\";\n\ntest(\"AC-4-1: WHEN shout('hi') runs THEN it returns HI!\", () => assert.equal(shout(\"hi\"), \"HI!\"));\n";

export const ISSUE = "docs/issues/004-shout-a-word.md";

/** Issue #4's file: claimed, built at sha, approved, and its CI job never started. */
const waiting = (sha) => issue(4, "Shout a word", "Add `shout` to src/text.mjs, with a test.", "WHEN shout(\"hi\") runs THEN it returns \"HI!\".")
  .replace("Status: ready", "Status: in-progress · claimed by loop at 09:10 · on feat/4-shout")
  + `\n## Comments\n\n- Review · ${sha} · approve. Fresh reviewer, from \`git diff main...${sha}\`.\n`
  + `- CI · ${sha} · .github/workflows/ci.yml, job check, failed in 0 steps: "${BILLING}"\n`;

export function build(dir) {
  repo(dir, {
    "package.json": PACKAGE,
    ".github/workflows/ci.yml": CI,
    "src/text.mjs": "// Small text helpers.\n",
    "docs/stack.md": "# Stack\n\nNode, no framework.\n\n## Automation level\n\nFull automation. Loop: on. Merges: agents, every lane. In flight at once: 3.\n",
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n- **In flight:** #4, built and approved. Its CI job never started.\n\n## Waiting on you\n\n",
    "docs/issues/README.md": ISSUES_README,
  });
  git(dir, "switch", "--quiet", "-c", "feat/4-shout");
  write(dir, { "src/text.mjs": SHOUT, "test/text.test.mjs": SHOUT_TEST });
  const head = commit(dir, "#4 Shout a word");
  git(dir, "switch", "--quiet", "main");
  write(dir, { [ISSUE]: waiting(head) });
  const start = commit(dir, "#4 reviewed");
  return { start, head };
}
