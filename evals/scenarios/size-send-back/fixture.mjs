// #378: a loop on Full with two built issues waiting for review. #1's branch has over 1,000 counted lines, so
// coordinate step 6 sends it back with a split brief before any review. #2's is small, so it goes on to review as
// today. There's no GitHub remote here, so the issues are files.
import { commit, git, repo, write } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

const STACK = "# Stack\n\nNode, no framework.\n\n## Automation level\n\nFull automation. Loop: on. Merges: agents, every lane. In flight at once: 3.\n";

export const ONE = "docs/issues/001-chore-report.md";
export const TWO = "docs/issues/002-count-the-chores.md";
const ROWS = 1200;

// 1,200 rows of real source: over the 1,000 limit, and not a lockfile, a generated file or a fixture.
const REPORT = "// Every chore type the report knows, with its usual minutes.\nexport const CHORES = [\n"
  + Array.from({ length: ROWS }, (_, i) => `  { id: ${i + 1}, name: "chore ${i + 1}", minutes: ${5 + (i % 55)} },\n`).join("")
  + "];\n";
const REPORT_TEST = "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { CHORES } from \"../src/report.mjs\";\n\n"
  + `test("AC-1-1: WHEN the report loads THEN it has every chore type", () => assert.equal(CHORES.length, ${ROWS}));\n`;
const COUNT = "// How many chores a list has.\nexport const count = (chores) => chores.length;\n";
const COUNT_TEST = "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { count } from \"../src/count.mjs\";\n\n"
  + "test(\"AC-2-1: WHEN the list has two chores THEN the count is 2\", () => assert.equal(count([{}, {}]), 2));\n";

/** An issue file: claimed, built at sha on its branch, and waiting for review. */
const waiting = (text, branch, sha) => text.replace("Status: ready", `Status: in-progress · claimed by loop at 09:10 · on ${branch} · waiting for review`)
  + `\n## Comments\n\n- Built · ${sha} · the builder reported its head on ${branch}.\n`;

/** One branch from main with files, committed. Returns its head sha. */
function branch(dir, name, files, message) {
  git(dir, "switch", "--quiet", "-c", name);
  write(dir, files);
  const sha = commit(dir, message);
  git(dir, "switch", "--quiet", "main");
  return sha;
}

export function build(dir) {
  repo(dir, {
    "package.json": PACKAGE,
    "AGENTS.md": "# AGENTS.md\n\n- **What it is:** a shared chores list for flatmates.\n- **Commands that work here:** `npm run check`.\n",
    "docs/stack.md": STACK,
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n- **In flight:** #1 and #2, built and waiting for review.\n",
    "docs/issues/README.md": ISSUES_README,
  });
  const big = branch(dir, "feat/1-report", { "src/report.mjs": REPORT, "test/report.test.mjs": REPORT_TEST }, "#1 Chore report");
  const small = branch(dir, "feat/2-count", { "src/count.mjs": COUNT, "test/count.test.mjs": COUNT_TEST }, "#2 Count the chores");
  write(dir, {
    [ONE]: waiting(issue(1, "Chore report", "Add src/report.mjs: every chore type with its usual minutes.", "WHEN the report loads THEN it has every chore type."), "feat/1-report", big),
    [TWO]: waiting(issue(2, "Count the chores", "Add src/count.mjs: how many chores a list has.", "WHEN the list has two chores THEN the count is 2."), "feat/2-count", small),
  });
  const start = commit(dir, "#1 and #2 built, waiting for review");
  return { start, big, small };
}
