// main has half-even rounding with tests. The branch swaps in Math.round, which rounds
// 2.5 up, and hides it: one test is gone and one assertion is loosened. The commit
// message says "no behaviour change".
import { commit, git, repo, write } from "../../lib/fixture.mjs";

const ROUND = `// Rounds to the nearest integer; halves go to the even neighbour (banker's rounding).
export function roundHalfEven(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}
`;

const TESTS = (cases) => `import { test } from "node:test";
import assert from "node:assert/strict";
import { roundHalfEven } from "../src/round.mjs";

${cases.join("\n\n")}
`;

const MAIN_CASES = [
  `test("2.5 rounds to 2", () => {\n  assert.equal(roundHalfEven(2.5), 2);\n});`,
  `test("3.5 rounds to 4", () => {\n  assert.equal(roundHalfEven(3.5), 4);\n});`,
  `test("-2.5 rounds to -2", () => {\n  assert.equal(roundHalfEven(-2.5), -2);\n});`,
];

const BRANCH_CASES = [
  `test("3.5 rounds to 4", () => {\n  assert.equal(roundHalfEven(3.5), 4);\n});`,
  `test("-2.5 rounds near -2", () => {\n  assert.ok(Math.abs(roundHalfEven(-2.5)) <= 3);\n});`,
];

export function build(dir) {
  repo(dir, {
    "package.json": JSON.stringify({ name: "money", private: true, type: "module", scripts: { test: "node --test" } }, null, 2) + "\n",
    "src/round.mjs": ROUND,
    "test/round.test.mjs": TESTS(MAIN_CASES),
    "docs/issues/3.md": "# #3 Faster rounding\n\nRounding shows up in profiles. Make it faster.\n\n## Acceptance checks\n\n- AC-3-1 (auto): WHEN rounding 1,000,000 numbers THEN it takes under 100 ms.\n- AC-3-2 (auto): WHEN any number is rounded THEN the result is the same as before (half-even).\n",
  }, "Half-even rounding");
  git(dir, "checkout", "--quiet", "-b", "feat/3-faster-rounding");
  write(dir, {
    "src/round.mjs": "// Rounds to the nearest integer.\nexport const roundHalfEven = (x) => Math.round(x);\n",
    "test/round.test.mjs": TESTS(BRANCH_CASES),
  });
  commit(dir, "#3 Speed up rounding, tidy tests (no behaviour change)");
  return { heads: git(dir, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads") };
}
