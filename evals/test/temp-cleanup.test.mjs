// Tests that the harness tests leave no temp folders behind (#142). Running every harness test in a child
// would double `npm run test:evals`, so one test runs a sample that uses each folder maker, and a guard
// makes sure no other test file makes its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// setup() alone, setup() with a real harness run (which makes and removes its own folder), and failedChecks().
const SAMPLE = ["^bad flags", "^fail: a failing 'with' check", "^AC-143-1"];
const FILES = ["run.test.mjs", "decision-lifts-gate.test.mjs"].map((name) => join(HERE, name));
// The folder makers, as paths from this folder: each removes what it makes, and makes it with one mkdtemp call (#180).
const MAKERS = ["harness.mjs", "failed-checks.mjs"];
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

const OWN = fileURLToPath(import.meta.url).split(/[\\/]/).at(-1);

const CALL = /\bmkdtemp(?:Sync)?\(/g;
// What comes just before a maker's one allowed tmpdir(: its mkdtemp call, so the folder is the one it removes.
const IN_MKDTEMP = /\bmkdtemp(?:Sync)?\(\s*(?:join\(\s*)?$/;
// The dry run's results folder: the run never makes it, and the dry-run tests check it doesn't exist.
const NEVER_MADE_BEFORE = /\bjoin\(\s*$/;
const NEVER_MADE_AFTER = /^\),\s*"evals-never"\)/;
const INTO_MKDIR = /\bmkdir(?:Sync)?\(\s*join\(\s*$/;

/** Whether the tmpdir( call at index i is allowed: a maker's mkdtemp folder, or the never-made folder outside a mkdir. */
function allowed(text, i, maker) {
  const before = text.slice(0, i);
  if (maker && IN_MKDTEMP.test(before)) return true;
  return NEVER_MADE_BEFORE.test(before) && NEVER_MADE_AFTER.test(text.slice(i + "tmpdir(".length)) && !INTO_MKDIR.test(before);
}

/** Whether a file's text makes a temp folder its maker's allowance doesn't cover, judging each call on its own. */
function leaks(text, maker) {
  if (maker ? (text.match(CALL) ?? []).length > 1 : /mkdtemp/.test(text)) return true;
  return [...text.matchAll(/tmpdir\(/g)].some((m) => !allowed(text, m.index, maker));
}

/** The .mjs, .js and .cjs files in dir and its subfolders that make a temp folder no maker removes, as paths from dir. */
function findLeaks(dir) {
  return readdirSync(dir, { recursive: true })
    .map((name) => name.split(/[\\/]/).join("/"))
    .filter((name) => /\.[cm]?js$/.test(name) && name !== OWN)
    .filter((name) => leaks(readFileSync(join(dir, name), "utf8"), MAKERS.includes(name)));
}

test("AC-142-2: only the folder makers make temp folders, so every eval test's folders are removed", () => {
  const leaks = findLeaks(HERE);
  assert.deepEqual(leaks, [], "use setup() in harness.mjs or failedChecks() in failed-checks.mjs");
});

const MAKE = "const dir = mkdtempSync(join(tmpdir(), \"evals-test-\"));\n";
const OWN_FOLDER = "mkdirSync(join(tmpdir(), \"evals-mine\"), { recursive: true });\n";
// Each case is a planted folder of files, and the files the guard must name.
const PLANTED = {
  "a test file that makes its own folder": [{ "planted.test.mjs": OWN_FOLDER }, ["planted.test.mjs"]],
  "a helper in a subfolder that makes its own folder": [{ "sub/planted.mjs": OWN_FOLDER }, ["sub/planted.mjs"]],
  "a test file in a subfolder that calls mkdtemp": [{ "sub/deeper/planted.test.mjs": MAKE }, ["sub/deeper/planted.test.mjs"]],
  "a maker that gains a second mkdtemp": [{ "harness.mjs": `${MAKE}${MAKE}` }, ["harness.mjs"]],
  "a maker that also makes its own folder": [{ "failed-checks.mjs": `${MAKE}${OWN_FOLDER}` }, ["failed-checks.mjs"]],
  "a maker's name in a subfolder": [{ "sub/harness.mjs": MAKE }, ["sub/harness.mjs"]],
  // Each tmpdir( call is judged on its own, not by the line it's on (#180 review).
  "a folder made on the same line as the never-made folder": [
    { "planted.test.mjs": "mkdirSync(join(tmpdir(), \"mine\")); const never = join(tmpdir(), \"evals-never\");\n" }, ["planted.test.mjs"]],
  "the never-made folder passed to a mkdir": [
    { "planted.test.mjs": "mkdirSync(join(tmpdir(), \"evals-never\"), { recursive: true });\n" }, ["planted.test.mjs"]],
  "a maker's mkdtemp line that also makes its own folder": [
    { "harness.mjs": "const dir = mkdtempSync(join(tmpdir(), \"evals-test-\")); mkdirSync(join(tmpdir(), \"x\"));\n" }, ["harness.mjs"]],
  "a .js helper that calls mkdtemp": [{ "sub/planted.js": MAKE }, ["sub/planted.js"]],
  "a .cjs helper that calls mkdtemp": [{ "sub/planted.cjs": MAKE }, ["sub/planted.cjs"]],
  "each maker's one mkdtemp, and a dry run's folder that is never made": [
    { "harness.mjs": MAKE, "failed-checks.mjs": MAKE, "dry-run.test.mjs": "run(\"--dry-run\", \"--results-dir\", join(tmpdir(), \"evals-never\"));\n" }, []],
};

test("AC-180-2: WHEN a planted file in evals/test/ or a subfolder calls mkdirSync(join(tmpdir(), ...)), or an allowed file gains a second mkdtemp THEN the guard fails", (t) => {
  const root = mkdtempSync(join(tmpdir(), "evals-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [i, [name, [files, want]]] of Object.entries(PLANTED).entries()) {
    const dir = join(root, String(i));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    assert.deepEqual(findLeaks(dir), want, name);
  }
});
