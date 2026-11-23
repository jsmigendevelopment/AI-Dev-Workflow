import { test } from "node:test";
import assert from "node:assert/strict";
import { init } from "../src/init.mjs";
import { update } from "../src/update.mjs";
import { exists, logger, makeKit, put, read, tmp } from "./helpers.mjs";

const v1 = {
  "AGENTS.md": "rules v1\n",
  "keep.md": "same in both\n",
  "untouched.md": "old\n",
  "edited.md": "old\n",
  "gone.md": "removed in v2\n",
  "gone-edited.md": "removed in v2\n",
};
const v2 = {
  "AGENTS.md": "rules v2\n",
  "keep.md": "same in both\n",
  "untouched.md": "new\n",
  "edited.md": "new\n",
  "added/new.md": "brand new\n",
};

function installed() {
  const dir = tmp();
  init(dir, { kitDir: makeKit("0.1.0", v1), log: logger() });
  put(dir, "edited.md", "my edit\n");
  put(dir, "gone-edited.md", "my edit\n");
  return { dir, kitDir: makeKit("0.2.0", v2) };
}

test("update replaces unchanged files, keeps edits, adds new, deletes removed", () => {
  const { dir, kitDir } = installed();
  const log = logger();
  assert.equal(update(dir, { kitDir, log }), 0);

  assert.equal(read(dir, "untouched.md"), "new\n");
  assert.equal(read(dir, "AGENTS.md"), "rules v2\n");
  assert.equal(read(dir, "edited.md"), "my edit\n");
  assert.equal(read(dir, "edited.md.kit-new"), "new\n");
  assert.equal(read(dir, "added/new.md"), "brand new\n");
  assert.ok(!exists(dir, "gone.md"));
  assert.equal(read(dir, "gone-edited.md"), "my edit\n");
  assert.match(log.text(), /edited\.md\.kit-new/);
  assert.match(log.text(), /keep \(removed from the kit, but you changed it\) gone-edited\.md/);

  const manifest = JSON.parse(read(dir, ".ai-dev-workflow.json"));
  assert.equal(manifest.kitVersion, "0.2.0");
  assert.deepEqual(Object.keys(manifest.files).sort(), ["AGENTS.md", "added/new.md", "edited.md", "keep.md", "untouched.md"]);

  // The edit still counts as the person's on the next update: no new .kit-new noise.
  const again = logger();
  update(dir, { kitDir, log: again });
  assert.equal(read(dir, "edited.md"), "my edit\n");
  assert.match(again.text(), /unchanged/);
  assert.doesNotMatch(again.text(), /kit-new/);
});

test("update --dry-run prints the plan and changes nothing", () => {
  const { dir, kitDir } = installed();
  const before = read(dir, ".ai-dev-workflow.json");
  const log = logger();
  assert.equal(update(dir, { kitDir, dryRun: true, log }), 0);
  assert.match(log.text(), /dry run/);
  assert.match(log.text(), /update untouched\.md/);
  assert.match(log.text(), /delete \(removed from the kit\) gone\.md/);
  assert.equal(read(dir, "untouched.md"), "old\n");
  assert.ok(exists(dir, "gone.md"));
  assert.ok(!exists(dir, "added/new.md"));
  assert.ok(!exists(dir, "edited.md.kit-new"));
  assert.equal(read(dir, ".ai-dev-workflow.json"), before);
});

test("update keeps the person's AGENTS.md and refreshes AGENTS.kit.md", () => {
  const dir = tmp();
  put(dir, "AGENTS.md", "ours\n");
  init(dir, { kitDir: makeKit("0.1.0", v1), log: logger() });
  const log = logger();
  update(dir, { kitDir: makeKit("0.2.0", v2), log });
  assert.equal(read(dir, "AGENTS.md"), "ours\n");
  assert.equal(read(dir, "AGENTS.kit.md"), "rules v2\n");
  assert.match(log.text(), /\/join/);
});

test("update without an install says to run init", () => {
  const log = logger();
  assert.equal(update(tmp(), { kitDir: makeKit("0.2.0", v2), log }), 1);
  assert.match(log.text(), /init/);
});
