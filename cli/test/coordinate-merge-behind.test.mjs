// #263: a pull request whose base is behind is checked on main merged in; owner-only checks come last.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const coordinate = read(".agents/skills/coordinate/SKILL.md");
const step7 = coordinate.split("7. **Merge through one queue,**")[1].split("\n8. ")[0];
const ask = read(".agents/skills/ask/SKILL.md");
const section = ask.split("## A check only the person can run")[1].split("\n## ")[0];

test("step 7 checks the merge of main and the head before merging", () => {
  assert.match(step7, /\*\*Base behind main\?\*\* Before you treat the head as checked, merge main into the branch/);
  assert.match(step7, /run step 6\.1 again on that merge commit\. Merge only on its `Checks: pass @ <sha>`/);
});

test("step 7 asks owner-only checks last, naming the sha, and points to ask", () => {
  assert.match(step7, /comes last, once: after every review pass and the merge check above are green, and naming that exact sha/);
  assert.match(step7, /`ask`, "A check only the person can run"/);
});

test("ask says what happens on each level", () => {
  assert.match(section, /\*\*Ask last, once\.\*\*/);
  assert.match(section, /`Try <check> on <sha>`/);
  assert.match(section, /\*\*Below Full:\*\* one ⏳ decision/);
  assert.match(section, /\*\*On Full:\*\* nothing waits on it \(decision 263-1\)/);
  assert.match(read("docs/decisions/263-1.md"), /AI pick, not reviewed/);
});
