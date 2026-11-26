// Tests that the CLI suite leaves no temp folders behind (#142). Running the whole suite in a child
// would double `npm test`'s time, so one test runs a sample that uses every helper that makes a folder,
// and a guard makes sure every other test file gets its folders from those helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { put, safeEnv, tmp } from "./helpers.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// tmp() and makeKit (rename, update), fakeSystem (fix), fakeGh (local-gate), a spawned CLI (rename, procs), presence.
const SAMPLE = ["rename", "update", "fix", "local-gate", "procs", "presence"].map((name) => `${HERE}${name}.test.mjs`);
// npm's own compile cache: one fixed folder every npm command on the machine shares and reuses. Not a test's.
const NPM_CACHE = "node-compile-cache";

test("AC-142-1: WHEN a sample of the CLI suite runs with TMPDIR set to an empty folder THEN the folder is empty afterwards", () => {
  const dir = tmp("onrails-empty-");
  // The nested runner must not think it's a child of this one, or it reports in the parent's format.
  const env = safeEnv({ NODE_TEST_CONTEXT: undefined, TMPDIR: dir, TMP: dir, TEMP: dir });
  const r = spawnSync(process.execPath, ["--test", ...SAMPLE], { encoding: "utf8", env, timeout: 120_000 });
  assert.equal(r.status, 0, r.stdout.slice(-2000));
  assert.match(r.stdout, /^# pass [1-9]/m, "the sample ran");
  assert.deepEqual(readdirSync(dir).filter((name) => name !== NPM_CACHE), []);
});

// The files that make temp folders and remove them: helpers.mjs when a test file ends, and safe-path-preload.mjs (the
// run's copy of node) when its process exits, which AC-197-2 and AC-197-3 check in safe-path.test.mjs.
// As paths from this folder; each makes its folders with one mkdtemp call (#180).
const REMOVERS = ["helpers.mjs", "safe-path-preload.mjs"];
const OWN = fileURLToPath(import.meta.url).split(/[\\/]/).at(-1);

const CALL = /\bmkdtemp(?:Sync)?\(/;

/** Whether a file's text makes a temp folder it may not: a remover may make one, with one mkdtemp call. */
function leaks(text, remover) {
  if (!remover) return /mkdtemp|tmpdir\(/.test(text);
  const calls = text.match(new RegExp(CALL, "g")) ?? [];
  return calls.length > 1 || text.split("\n").some((line) => /tmpdir\(/.test(line) && !CALL.test(line));
}

/** The .mjs files in dir and its subfolders that make a temp folder no remover removes, as paths from dir. */
function findLeaks(dir) {
  return readdirSync(dir, { recursive: true })
    .map((name) => name.split(/[\\/]/).join("/"))
    .filter((name) => name.endsWith(".mjs") && name !== OWN)
    .filter((name) => leaks(readFileSync(join(dir, name), "utf8"), REMOVERS.includes(name)));
}

test("AC-142-1: every CLI test file makes its temp folders through helpers.mjs, which removes them", () => {
  const leaks = findLeaks(HERE);
  assert.deepEqual(leaks, [], "use tmp() from helpers.mjs, so the folder is removed when the file ends");
});

const MAKE = "const dir = mkdtempSync(join(tmpdir(), \"onrails-\"));\n";
const OWN_FOLDER = "mkdirSync(join(tmpdir(), \"onrails-mine\"), { recursive: true });\n";
// Each case is a planted folder of files, and the files the guard must name.
const PLANTED = {
  "a test file that makes its own folder": [{ "planted.test.mjs": OWN_FOLDER }, ["planted.test.mjs"]],
  "a helper in a subfolder that makes its own folder": [{ "sub/planted.mjs": OWN_FOLDER }, ["sub/planted.mjs"]],
  "a test file in a subfolder that calls mkdtemp": [{ "sub/deeper/planted.test.mjs": MAKE }, ["sub/deeper/planted.test.mjs"]],
  "a remover that gains a second mkdtemp": [{ "helpers.mjs": `${MAKE}${MAKE}` }, ["helpers.mjs"]],
  "a remover that also makes its own folder": [{ "safe-path-preload.mjs": `${MAKE}${OWN_FOLDER}` }, ["safe-path-preload.mjs"]],
  "a remover's name in a subfolder": [{ "sub/helpers.mjs": MAKE }, ["sub/helpers.mjs"]],
  "each remover's one mkdtemp": [{ "helpers.mjs": MAKE, "safe-path-preload.mjs": MAKE }, []],
};

test("AC-180-2: WHEN a planted file in cli/test/ or a subfolder calls mkdirSync(join(tmpdir(), ...)), or a remover gains a second mkdtemp THEN the CLI guard fails", () => {
  const root = tmp("onrails-guard-");
  for (const [i, [name, [files, want]]] of Object.entries(PLANTED).entries()) {
    const dir = join(root, String(i));
    for (const [path, text] of Object.entries(files)) put(dir, path, text);
    assert.deepEqual(findLeaks(dir), want, name);
  }
});

// Logs the path of every rmSync call. Loaded with --require, before a test file's own imports bind node:fs.
const COUNT_REMOVALS = `const fs = require("fs");
const rm = fs.rmSync;
fs.rmSync = (path, options) => { fs.appendFileSync(process.env.ONRAILS_RM_LOG, path + "\\n"); return rm(path, options); };
require("module").syncBuiltinESMExports();
`;
const PREFLIGHT = readdirSync(HERE).filter((name) => /^preflight.*\.test\.mjs$/.test(name)).map((name) => join(HERE, name));

/** Runs test files the way `npm test` does, with TMPDIR set to dir and every rmSync logged to log. */
function runCounted(dir, log, files) {
  const counter = join(dirname(log), "count-removals.cjs");
  put(dirname(log), "count-removals.cjs", COUNT_REMOVALS);
  // The nested runner must not think it's a child of this one, or it reports in the parent's format.
  const env = safeEnv({ NODE_TEST_CONTEXT: undefined, TMPDIR: dir, TMP: dir, TEMP: dir, ONRAILS_RM_LOG: log });
  const preload = join(HERE, "safe-path-preload.mjs");
  return spawnSync(process.execPath, ["--require", counter, "--require", preload, "--test", ...files], { encoding: "utf8", env, timeout: 120_000 });
}

// Each registration removes its folder once when the file ends, so a folder removed twice was registered twice.
test("AC-180-3: WHEN the preflight tests run THEN no folder is registered twice, and none is left", () => {
  const root = tmp("onrails-removals-");
  const dir = join(root, "tmp");
  const log = join(root, "removed.log");
  mkdirSync(dir);
  const r = runCounted(dir, log, PREFLIGHT);
  assert.equal(r.status, 0, r.stdout.slice(-2000));
  const removed = readFileSync(log, "utf8").split("\n").filter((path) => dirname(path) === dir);
  assert.ok(removed.length > 0, "the preflight tests made temp folders");
  assert.deepEqual(removed.filter((path, i) => removed.indexOf(path) !== i), [], "removed twice");
  assert.deepEqual(readdirSync(dir).filter((name) => name !== NPM_CACHE), []);
});

test("#180 item 5: WHEN a test file makes a folder with tmp() while it loads and then throws THEN the folder is removed", () => {
  const root = tmp("onrails-throws-");
  const dir = join(root, "tmp");
  mkdirSync(dir);
  const helpers = pathToFileURL(join(HERE, "helpers.mjs")).href;
  put(root, "throws.test.mjs", `import { tmp } from ${JSON.stringify(helpers)};\ntmp("onrails-loading-");\nthrow new Error("broken while loading");\n`);
  const r = runCounted(dir, join(root, "removed.log"), [join(root, "throws.test.mjs")]);
  assert.notEqual(r.status, 0, "the file threw");
  assert.match(r.stdout, /broken while loading/);
  assert.deepEqual(readdirSync(dir).filter((name) => name !== NPM_CACHE), []);
});
