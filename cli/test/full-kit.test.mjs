// #143: doctor and update read the automation level the way the agent-file guard does. full-kit.mjs keeps
// its own copy of the read (the CLI doesn't import the kit's scripts), so this keeps the two in step
// (review on #159, nice 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { automationLevel } from "../src/full-kit.mjs";
import { level } from "../../.agents/skills/coordinate/scripts/agent-files.mjs";
import { put, tmp } from "./helpers.mjs";

const STACKS = {
  "full with a comment": "## Automation level\n\n- **Level:** full  <!-- recommended | full | hands-on | custom -->\n",
  "in backticks": "- **Level:** `hands-on`\n",
  "upper case": "- **level:** FULL\n",
  "custom": "- **Level:** custom\n",
  "no bold": "- Level: full\n",
  "no level line": "# Stack\n\nNode, no framework.\n",
  "empty": "",
};

test("#159 nice 5: automationLevel and agent-files.mjs's level read docs/stack.md the same way", () => {
  for (const [name, stack] of Object.entries(STACKS)) {
    const dir = tmp();
    put(dir, "docs/stack.md", stack);
    assert.equal(automationLevel(dir), level(stack), name);
  }
  assert.equal(automationLevel(tmp()), level(), "no docs/stack.md at all");
});
