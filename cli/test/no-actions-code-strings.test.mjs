// #387 (part of #98, no GitHub Actions): the comments and strings of the code files under .agents/, evals/, guide/
// and stacks/ never tell an agent to use or wait on a workflow, or name CI where the session runs the check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { badMentions, codeMentions } from "./actions-scan.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const CODE = /\.(?:mjs|ts|tsx|js|cjs|yml|yaml|toml|jsonc|tpl)$/;

// Test data, not advice. Each entry names why it is skipped.
const SKIP = [
  { path: /\.test\.[^/]+$/, why: "a test's strings are its cases: lines the scan or a script must catch or pass" },
  { path: /^evals\/test\//, why: "the eval runner's own tests, with fake transcripts" },
  { path: /^evals\/scenarios\/ci-never-starts\/fixture\.mjs$/, why: "seeds an old repo with a workflow on purpose, to check the loop never waits on it" },
  {
    path: /^evals\/scenarios\/(?:ci-never-starts|show-it-early)\/checks\.mjs$/,
    why: "an eval's grader: like a test, its strings name the workflow writes and waits that fail a run",
  },
];
const skipped = (path) => SKIP.some((s) => s.path.test(path));

function codeFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return codeFiles(path);
    return CODE.test(name) ? [relative(REPO, path).split("\\").join("/")] : [];
  });
}

test("AC-387-2: WHEN a code line names ci, Ci or process.env.CI as an identifier THEN the scan doesn't count it", () => {
  for (const [path, ok] of [
    ["a.mjs", "const ci = readProfile().ci;\nif (ci === \"local\") runChecks();\n"],
    ["a.ts", "const Ci = { local: 1 } as const;\nexport const CI_ACTIONS = 2;\n"],
    ["a.js", "if (process.env.CI) skipBrowser();\n"],
    ["a.mjs", "const dir = \".github/workflows/\";\nconst re = /\\bCI\\b|workflow/i;\nconst n = total / ci / 2;\n"],
    ["a.tsx", "export const Row = () => <div className=\"ci\">{ci}</div>;\n"],
    ["a.yml", "ci:\n  run: pnpm lint\nenv:\n  CI: true\n"],
    ["a.toml", "[workflow]\nci = \"local\"\n"],
  ]) assert.deepEqual(codeMentions(ok, path), [], `${path}: ${ok}`);
});

test("AC-387-2: WHEN a comment or a message says wait for CI THEN the scan counts it", () => {
  for (const [path, bad] of [
    ["a.mjs", "const ci = 1; // wait for CI\n"],
    ["a.mjs", "f(); // not a value\n// wait for CI\n"],
    ["a.ts", "/**\n * Wait for CI before the merge.\n */\nexport const x = 1;\n"],
    ["a.mjs", "throw new Error(\"Wait for the workflow to finish.\");\n"],
    ["a.mjs", "const m = 'Wait for CI, then merge.';\n"],
    ["a.mjs", "const m = `Wait for CI on ${pr.number}.`;\n"],
    ["a.tsx", "// CI sends the password.\nexport const A = () => <p>{x}</p>;\n"],
    ["a.yml", "pre-push:\n  # skipped in CI\n  run: pnpm check\n"],
    ["a.yaml", "packages:\n  - \".\" # and in CI\n"],
    ["a.toml", "# CI runs this on every push.\nci = \"local\"\n"],
    ["a.jsonc", "{\n  // Wait for CI.\n  \"a\": 1\n}\n"],
  ]) assert.equal(codeMentions(bad, path).length, 1, `${path}: ${bad}`);
});

test("AC-387-2: a string that drives ci = \"actions\" passes, and a code string in a template stays code", () => {
  assert.deepEqual(codeMentions("// On ci = \"actions\" the workflow deploys main to test.\n", "a.mjs"), []);
  assert.deepEqual(codeMentions("const s = `${a}/${b}`; // wait for CI\n", "a.mjs"), ["wait for CI"]);
  assert.deepEqual(codeMentions("const s = `x ${f(\"wait for CI\")} y`;\n", "a.mjs"), ["wait for CI"]);
});

test("AC-387-1: each skipped path is named with its reason, and each named fixture still exists", () => {
  for (const s of SKIP) assert.ok(s.why.length > 20, String(s.path));
  for (const path of ["evals/test", "evals/scenarios/ci-never-starts/fixture.mjs", "evals/scenarios/ci-never-starts/checks.mjs", "evals/scenarios/show-it-early/checks.mjs"])
    assert.ok(existsSync(join(REPO, path)), path);
});

test("AC-387-1: no comment or string in a code file under .agents/, evals/, guide/ or stacks/ tells an agent to use or wait on a workflow", () => {
  const paths = [".agents", "evals", "guide", "stacks"].flatMap((dir) => codeFiles(join(REPO, dir))).filter((p) => !skipped(p));
  assert.ok(paths.length > 300, `found the code files (${paths.length})`);
  const found = paths.flatMap((path) => codeMentions(readFileSync(join(REPO, path), "utf8"), path).map((s) => `${path}: ${s.slice(0, 160)}`));
  assert.deepEqual(found, []);
});

test("#387 follow-up 1: in a sentence that bans a merge, a negation after the CI word doesn't pass it", () => {
  for (const bad of [
    "Never merge if CI hasn't passed.",
    "Don't merge while CI isn't green.",
    "Never merge if the workflow has not finished.",
  ]) assert.equal(badMentions(bad).length, 1, bad);
  for (const ok of [
    "Never merge on ci = \"local\" before the local gate passes.",
    "Never wait on a workflow before a merge.",
    "Never merge, and never wait on CI.",
  ]) assert.deepEqual(badMentions(ok), [], ok);
});

test("#387 follow-up 2: a lead opts its section in only when its first clause sets the ci = \"actions\" condition", () => {
  assert.deepEqual(badMentions("## The token\n\nOnly for the person: they turn on `ci = \"actions\"`.\n\nWait for CI.\n"), ["Wait for CI."]);
  assert.deepEqual(badMentions("## The token\n\nOnly if `ci = \"actions\"` is off, the token stays here.\n\nWait for CI.\n"), ["Wait for CI."]);
  assert.deepEqual(badMentions("## The token\n\nOnly on `ci = \"actions\"` (`docs/stack.md`), which only the person turns on.\n\nWait for CI.\n"), []);
});

test("AC-451-1: WHEN code text holds \"Don't merge: CI hasn't finished.\" THEN the scan fails it", () => {
  for (const bad of ["Don't merge: CI hasn't finished.", "Never merge: CI isn't green yet.", "Do not merge: the workflow has not finished."]) {
    assert.equal(badMentions(bad).length, 1, bad);
    assert.equal(codeMentions(`// ${bad}\nexport const x = 1;\n`, "a.mjs").length, 1, bad);
  }
  for (const ok of ["Never merge: never wait on CI.", "Don't merge: a red local gate stops it, not CI."]) assert.deepEqual(badMentions(ok), [], ok);
});

test("AC-451-2: WHEN a YAML file holds a plain, | or > value that names CI as the actor THEN the scan fails it", () => {
  for (const bad of [
    "msg: Wait for CI before merge\n",
    "steps:\n  - Wait for CI to pass\n",
    "run: |\n  pnpm check\n  # wait for CI\n",
    "note: >\n  Wait for the workflow\n  to finish.\n",
    "note: >-\n  CI runs this on every push.\nother: x\n",
    "msg: Wait for\n  CI to pass\n",
  ]) assert.equal(codeMentions(bad, "a.yml").length, 1, bad);
  for (const ok of [
    "msg: Never wait on CI\n",
    "name: Lint and test\nrun: pnpm check --ci\n",
    "run: |\n  pnpm lint\n  pnpm test\nafter: Run the local gate\n",
    "note: >\n  The local gate runs it.\nCI: true\n",
    "- Run `ci = \"local\"` checks\n",
  ]) assert.deepEqual(codeMentions(ok, "a.yaml"), [], ok);
});

test("AC-451-2: WHEN a YAML file has CRLF line endings, a stray \\r or a U+2028 THEN the scan never throws and reads it as it reads LF", () => {
  for (const ok of [
    "msg: ok\r\n",
    "# comment\r\nx: y\r\n",
    "msg: Never wait on CI\r\nrun: |\r\n  pnpm lint\r\nafter: Run the local gate\r\n",
    "msg: ok x: y\n",
    "msg: ok\rx: y\n",
  ]) assert.deepEqual(codeMentions(ok, "a.yml"), [], JSON.stringify(ok));
  for (const bad of [
    "msg: Wait for CI before merge\r\n",
    "steps:\r\n  - Wait for CI to pass\r\n",
    "run: |\r\n  pnpm check\r\n  # wait for CI\r\n",
    "note: >-\r\n  Wait for the workflow\r\n  to finish.\r\nother: x\r\n",
    "msg: Wait for\r\n  CI to pass\r\n",
    "# Wait for\r\n# CI to pass\r\nx: y\r\n",
    "msg: Wait for CI x: y\n",
  ]) assert.equal(codeMentions(bad, "a.yml").length, 1, JSON.stringify(bad));
  // A CRLF file reads the same as its LF twin, hit for hit.
  for (const lf of ["msg: Wait for\n  CI to pass\nrun: |\n  # wait for CI\n", "# CI runs this\n# on every push.\nname: Lint\n"])
    assert.deepEqual(codeMentions(lf.replace(/\n/g, "\r\n"), "a.yaml"), codeMentions(lf, "a.yaml"), JSON.stringify(lf));
});

test("AC-451-3: WHEN code text holds \"// wait for ci = done\" THEN the scan fails it, and a ci = \"…\" line still passes", () => {
  assert.equal(codeMentions("// wait for ci = done\n", "a.mjs").length, 1);
  assert.equal(codeMentions("const m = 'Wait for ci = true.';\n", "a.ts").length, 1);
  for (const ok of ["// The ci = \"…\" line in docs/stack.md.", "const s = 'ci = \"actions-later\"';"])
    assert.deepEqual(codeMentions(`${ok}\n`, "a.mjs"), [], ok);
});

test("AC-451-3: WHEN code text holds \"// wait for ci\" THEN the scan fails it, and a ci key or file name still passes", () => {
  assert.equal(codeMentions("// wait for ci\n", "a.mjs").length, 1);
  assert.equal(codeMentions("const m = 'Wait for ci to finish.';\n", "a.ts").length, 1);
  for (const ok of [
    "// Read the `ci` key from docs/stack.md.",
    "// The `ci = \"…\"` line in docs/stack.md.",
    "// Same as ci-mode.ts and preflight-ci.mjs.",
    "// The ci = \"local\" gate runs it.",
  ]) assert.deepEqual(codeMentions(`${ok}\n`, "a.mjs"), [], ok);
});

test("AC-451-3: no test title in the stack pack names CI or the workflows as the actor", () => {
  const files = [
    "stacks/tanstack-start/src/lib/site-gate.test.ts",
    "stacks/tanstack-start/scripts/cloudflare/local-keys.test.ts",
    "stacks/tanstack-start/scripts/connect/secrets-mode.test.ts",
  ];
  // Both name docs/stack.md itself, not the service: a heading the tests parse and the `ci` key's describe title.
  const names = ["## CI", "ci in docs/stack.md"];
  for (const path of files) assert.deepEqual(codeMentions(readFileSync(join(REPO, path), "utf8"), path).filter((s) => !names.includes(s)), [], path);
});

test("#387 follow-up 3: only a fence mark at least as long as the opening one closes a code block", () => {
  assert.deepEqual(badMentions("## Steps\n\n````md\n```\n## Never\n```\n````\n\nCI runs it.\n"), ["CI runs it."]);
  assert.deepEqual(badMentions("## Steps\n\n```\n## Never\n````\n\nCI runs it.\n"), ["CI runs it."]);
  assert.deepEqual(badMentions("## Steps\n\n```md\n```bash\n## Never\n```\n\nCI runs it.\n"), ["CI runs it."]);
});
