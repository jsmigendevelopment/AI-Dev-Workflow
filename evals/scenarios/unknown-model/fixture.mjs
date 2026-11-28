// #472 (AC-3 of #129): a built issue waiting for review, and a profile whose routing table names the model reviews
// should run on. The session shows no model, so the reviewer's run record must say `unknown` and why, never the
// model the table asked for. There's no GitHub remote here, so the issue is a file and the verdict goes under it.
import { commit, git, repo, write } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

/** The model and effort the routing table asks for. Made up, so no real session can be running on them. */
export const ROUTING_MODEL = "Claude Zephyr 9";
export const ROUTING_EFFORT = "extra-high";

const PROFILE = `[routing]
coordinator = "${ROUTING_MODEL}"
coordinator_effort = "${ROUTING_EFFORT}"
`;

const STACK = `# Stack

Node, no framework.

## Automation level

- **Level:** full  <!-- recommended | full | hands-on | custom -->
- **Loop:** on
- **Ping level:** blockers
`;

export const ISSUE = "docs/issues/003-greeting-list.md";
export const BRANCH = "feat/3-greeting-list";

const GREETING = `export const greet = (name) => \`Hello, \${name}!\`;
`;

const GREETING_LIST = `${GREETING}
export const greetAll = (names) => names.map(greet);
`;

const TEST = `import { test } from "node:test";
import assert from "node:assert/strict";
import { greet, greetAll } from "../src/greeting.mjs";

test("greet says hello", () => assert.equal(greet("Ana"), "Hello, Ana!"));
test("AC-3-1: greetAll greets each name", () => assert.deepEqual(greetAll(["Ana", "Bo"]), ["Hello, Ana!", "Hello, Bo!"]));
`;

export function build(dir) {
  repo(dir, {
    "package.json": PACKAGE,
    "src/greeting.mjs": GREETING,
    "docs/stack.md": STACK,
    "docs/profile.toml": PROFILE,
    "docs/issues/README.md": ISSUES_README,
    [ISSUE]: issue(3, "Greet a list of names", "Add `greetAll(names)` to `src/greeting.mjs`.", "WHEN greetAll gets two names THEN it returns both greetings.")
      .replace("Status: ready", "Status: in-progress · built on feat/3-greeting-list · waiting for review"),
  });
  const start = git(dir, "rev-parse", "HEAD");
  git(dir, "switch", "--quiet", "-c", BRANCH);
  write(dir, { "src/greeting.mjs": GREETING_LIST, "test/greeting.test.mjs": TEST });
  const head = commit(dir, "#3 Greet a list of names");
  git(dir, "switch", "--quiet", "main");
  return { start, head };
}
