// Tests that the harness tests leave no temp folders behind (#142). Running every harness test in a child
// would double `npm run test:evals`, so one test runs a sample that uses each folder maker, and a guard
// makes sure no other test file makes its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// setup() alone, setup() with a real harness run (which makes and removes its own folder), and failedChecks().
const SAMPLE = ["^bad flags", "^fail: a failing 'with' check", "^AC-143-1"];
const FILES = ["run.test.mjs", "decision-lifts-gate.test.mjs"].map((name) => join(HERE, name));
// The folder makers: each removes what it makes.
const MAKERS = ["run.test.mjs", "failed-checks.mjs"];
// npm's own compile cache: one fixed folder every npm command on the machine shares and reuses. Not a test's.
const NPM_CACHE = "node-compile-cache";
const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

test("AC-142-2: WHEN a sample of the eval tests runs with TMPDIR set to an empty folder THEN the folder is empty afterwards", { skip: skipWin }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "evals-empty-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // The nested runner must not think it's a child of this one, or it reports in the parent's format.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT"));
  const args = ["--test", ...SAMPLE.map((p) => `--test-name-pattern=${p}`), ...FILES];
  const r = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...env, TMPDIR: dir, TMP: dir, TEMP: dir }, timeout: 120_000 });
  assert.equal(r.status, 0, r.stdout.slice(-2000));
  assert.match(r.stdout, new RegExp(`^# pass ${SAMPLE.length}$`, "m"), "every sample test ran");
  assert.deepEqual(readdirSync(dir).filter((name) => name !== NPM_CACHE), []);
});

test("AC-142-2: only the folder makers make temp folders, so every eval test's folders are removed", () => {
  const own = fileURLToPath(import.meta.url).split(/[\\/]/).at(-1);
  const leaks = readdirSync(HERE)
    .filter((name) => name.endsWith(".mjs") && name !== own && !MAKERS.includes(name))
    .filter((name) => /mkdtemp/.test(readFileSync(join(HERE, name), "utf8")));
  assert.deepEqual(leaks, [], "use setup() in run.test.mjs or failedChecks() in failed-checks.mjs");
});
