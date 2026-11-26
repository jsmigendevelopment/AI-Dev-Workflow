// #150: follow-ups to the session deploys (#132). The TanStack pack's docs say what its deploy code
// does with TEST_APP_URL, and the fakes in these tests never swallow an error without saying why.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(REPO, path), "utf8");
const DOCS = [".agents/skills/stack-tanstack-start/SKILL.md", "stacks/tanstack-start/README.md"];

test("AC-150-3: the skill and the README say what the deploys do with TEST_APP_URL and PRODUCTION_APP_URL", () => {
  // The code: the test deploy smoke-tests TEST_APP_URL first; production prefers workers.dev.
  assert.match(read("stacks/tanstack-start/scripts/deploy/test-site.ts"), /deps\.local\('TEST_APP_URL'\) \?\? workersDevUrl\(out\)/);
  assert.match(read("stacks/tanstack-start/scripts/deploy/production.ts"), /workersDevUrl\(out\) \?\? deps\.local\('PRODUCTION_APP_URL'\)/);
  for (const path of DOCS) {
    const text = read(path).replace(/\s+/g, " ");
    assert.ok(!/TEST_APP_URL`?\)? (or `PRODUCTION_APP_URL` )?only when there is no workers\.dev URL/.test(text), `${path}: the old sentence`);
    assert.ok(/`TEST_APP_URL`, when set, is the address the test smoke test uses, before the workers\.dev URL/.test(text), `${path}: TEST_APP_URL`);
    assert.ok(/`PRODUCTION_APP_URL` only when there is no workers\.dev URL/.test(text), `${path}: PRODUCTION_APP_URL`);
  }
});

// A catch block with nothing in it, not even a comment, with or without a binding, on one line or
// across several.
const EMPTY_CATCH = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;

/** Each empty catch in `text`, as `<name>:<line>`. */
const emptyCatches = (name, text) =>
  [...text.matchAll(EMPTY_CATCH)].map((m) => `${name}:${text.slice(0, m.index).split("\n").length}`);

test("AC-150-4: the empty-catch guard finds an empty catch on one line or across several", () => {
  // Split, so this file's own text holds no empty catch.
  assert.deepEqual(emptyCatches("a.mjs", "try { x() } catch {" + "}\n"), ["a.mjs:1"]);
  assert.deepEqual(emptyCatches("b.mjs", "try {\n  x()\n} catch (error) {\n}\n"), ["b.mjs:3"]);
  assert.deepEqual(emptyCatches("c.mjs", "try {\n  x()\n} catch {\n  // gone already: nothing to clean\n}\n"), []);
});

test("AC-150-4: no test or fake in cli/test has an empty catch: each says why it can go on", () => {
  const dir = join(REPO, "cli/test");
  const empty = readdirSync(dir)
    .filter((name) => name.endsWith(".mjs"))
    .flatMap((name) => emptyCatches(name, read(join("cli/test", name))));
  assert.deepEqual(empty, []);
});
