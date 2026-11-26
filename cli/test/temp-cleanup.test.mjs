// Tests that the CLI suite leaves no temp folders behind (#142). Running the whole suite in a child
// would double `npm test`'s time, so one test runs a sample that uses every helper that makes a folder,
// and a guard makes sure every other test file gets its folders from those helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

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
const REMOVERS = ["helpers.mjs", "safe-path-preload.mjs"];

test("AC-142-1: every CLI test file makes its temp folders through helpers.mjs, which removes them", () => {
  const own = fileURLToPath(import.meta.url).split(/[\\/]/).at(-1);
  const leaks = readdirSync(HERE)
    .filter((name) => name.endsWith(".mjs") && !REMOVERS.includes(name) && name !== own)
    .filter((name) => /mkdtemp|tmpdir\(/.test(readFileSync(`${HERE}${name}`, "utf8")));
  assert.deepEqual(leaks, [], "use tmp() from helpers.mjs, so the folder is removed when the file ends");
});
