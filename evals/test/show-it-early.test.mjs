// AC-141-2 of #141: the show-it-early eval asks for no GitHub Actions workflow and fails a run that writes one. Its
// own file, so run.test.mjs, already past 500 lines, doesn't grow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { build } from "../scenarios/show-it-early/fixture.mjs";
import { listFiles, readText } from "../lib/fixture.mjs";
import { SHOW_DEV, SHOW_LINK, SHOW_LOCAL, SHOW_PLAN, SHOW_WORKFLOW } from "./show-it-early-plan.mjs";
import { failedChecks, tempDir } from "./failed-checks.mjs";

const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

/** The "with" arm's failed check ids on these steps. */
const failedWith = (t, steps) => failedChecks(t, "show-it-early", { with: { steps }, without: SHOW_PLAN.without });

test("AC-141-2: WHEN the show-it-early fixture is built THEN it writes no workflow file and asks for none", (t) => {
  const dir = join(tempDir(t), "repo");
  build(dir);
  const files = listFiles(dir);
  assert.deepEqual(files.filter((f) => f.startsWith(".github/")), []);
  for (const f of files) {
    const text = readText(dir, f) ?? "";
    assert.doesNotMatch(text, /\.github\/workflows|GitHub Actions|\bCI\b/, f);
  }
  // The issue asks for the local way instead.
  assert.match(readText(dir, "docs/issues/1.md"), /ci = "local"/);
});

// Writing a workflow fails the no-workflow check, even after the app was shown; skipping the local setup or showing
// it late fails the order check.
const SHORTCUTS = {
  "shown, then a workflow written too": [[SHOW_DEV, SHOW_LINK, SHOW_LOCAL, SHOW_WORKFLOW], ["AC-141-2-no-workflow"]],
  "a workflow instead of ci = local": [[SHOW_DEV, SHOW_LINK, SHOW_WORKFLOW], ["AC-5-seen-before-checks", "AC-141-2-no-workflow"]],
  "ci = local before the app was shown": [[SHOW_LOCAL, SHOW_DEV, SHOW_LINK], ["AC-5-seen-before-checks"]],
  "the good one": [SHOW_PLAN.with.steps, []],
};

test("AC-141-2: WHEN a run writes a workflow file THEN show-it-early fails it, and only the right checks fail", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});

// Only a write of ci = "local" to docs/stack.md counts as the checks set up. A read that names both, such as a grep,
// isn't one, before or after the app was shown.
const bash = (command) => ({ tool: "Bash", input: { command }, ok: true });
const READS_AND_WRITES = {
  "a grep of ci = local before the app was shown, then the write": [[bash("grep -n 'ci = \"local\"' docs/stack.md"), SHOW_DEV, SHOW_LINK, SHOW_LOCAL], []],
  "a grep of ci = local after the link, and no write": [[SHOW_DEV, SHOW_LINK, bash("grep -n 'ci = \"local\"' docs/stack.md")], ["AC-5-seen-before-checks"]],
  "ci = local appended by the shell after the link": [[SHOW_DEV, SHOW_LINK, bash("printf 'ci = \"local\"\\n' >> docs/stack.md")], []],
  "ci = 'local' set with sed -i after the link": [[SHOW_DEV, SHOW_LINK, bash("sed -i \"s/^ci = .*/ci = 'local'/\" docs/stack.md")], []],
};

test("AC-141-2: WHEN a command only reads ci = local in docs/stack.md THEN it doesn't count as the checks set up", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(READS_AND_WRITES)) assert.deepEqual(failedWith(t, steps), want, name);
});
