// #537: push-secrets --cloud-run puts a Go service's values on Google Cloud Run: secrets in Secret Manager, plain
// variables in the service's environment. A fake gcloud (secrets-fakes.mjs) logs every call; the real one never runs,
// and every value is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nodeOnly } from "./helpers.mjs";
import { LIVE_VALUE, PUSH, lastLine, repo, run, TEST_VALUE, UNIX } from "./secrets-fakes.mjs";

const SITE = "https://example.com";

/** A Go repo on ci = "local": the folder has a go.mod. */
function goRepo() {
  const dir = repo("local");
  writeFileSync(join(dir, "go.mod"), "module example.com/app\n\ngo 1.26\n");
  return dir;
}
const gcloud = (r) => r.calls.filter((c) => c.cmd === "gcloud");
const seen = (r) => r.stdout + r.stderr;
function noValue(text) {
  assert.doesNotMatch(text, /DO_NOT_PRINT/);
  assert.ok(!text.includes(SITE), "the plain variable's value is hidden too");
}

test("AC-537-1: WHEN --cloud-run and --dry-run run on a fixture THEN each name is listed with its destination and no value appears", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--dry-run", "--cloud-run"]);
  assert.equal(r.status, 0, seen(r));
  assert.match(r.stdout, /^test: would set API_TOKEN as a Secret Manager secret \(api-test-API_TOKEN\)$/m);
  assert.match(r.stdout, /^production: would set API_TOKEN as a Secret Manager secret \(api-production-API_TOKEN\)$/m);
  assert.match(r.stdout, /^production: would set SITE_URL as a Cloud Run variable \(service api-production\)$/m);
  assert.equal(lastLine(r.stdout), "Every value would be stored somewhere.");
  assert.deepEqual(r.calls, [], "a dry run starts no tool");
  noValue(seen(r));
});

test("AC-537-1: WHEN --env test is given with --cloud-run --dry-run THEN only the test names are listed", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--dry-run", "--cloud-run", "--env", "test"]);
  assert.equal(r.status, 0, seen(r));
  assert.match(r.stdout, /test: would set API_TOKEN as a Secret Manager secret/);
  assert.doesNotMatch(r.stdout, /production: would set/);
});

test("AC-537-2: WHEN a fake gcloud is on PATH THEN it sees one call per name, each value by stdin or a file and none in an argument or in the output", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run"]);
  assert.equal(r.status, 0, seen(r));
  const calls = gcloud(r);
  assert.deepEqual(calls.map((c) => c.argv.map((a) => (a.startsWith("--flags-file=") ? "--flags-file=<file>" : a)).join(" ")), [
    "secrets create api-test-API_TOKEN --data-file=- --quiet",
    "secrets create api-production-API_TOKEN --data-file=- --quiet",
    "run services update api-production --flags-file=<file> --quiet",
  ]);
  assert.deepEqual([calls[0].stdin, calls[1].stdin, calls[2].stdin], [TEST_VALUE, LIVE_VALUE, ""]);
  // The plain variable's value is in the file's update-env-vars entry, written for this one call.
  assert.deepEqual(JSON.parse(calls[2].files[0]), { "--update-env-vars": { SITE_URL: SITE } });
  const flagsFile = calls[2].argv.find((a) => a.startsWith("--flags-file=")).slice("--flags-file=".length);
  assert.equal(existsSync(flagsFile), false, "the file is gone after the call");
  for (const c of calls) for (const a of c.argv) assert.ok(![TEST_VALUE, LIVE_VALUE, SITE].some((v) => a.includes(v)), `no value in ${a}`);
  assert.match(r.stdout, /^test: set API_TOKEN as a Secret Manager secret \(api-test-API_TOKEN\)$/m);
  assert.match(r.stdout, /^production: set SITE_URL as a Cloud Run variable \(service api-production\)$/m);
  assert.equal(lastLine(r.stdout), "Every value is stored somewhere.");
  noValue(seen(r));
});

test("AC-537-2: WHEN the secret already exists THEN the value goes on as a new version, still on stdin", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run", "--env", "test"], undefined, { FAKE_FAIL: "gcloud secrets create" });
  assert.equal(r.status, 0, seen(r));
  assert.deepEqual(gcloud(r).map((c) => [c.argv.join(" "), c.stdin]), [
    ["secrets create api-test-API_TOKEN --data-file=- --quiet", TEST_VALUE],
    ["secrets versions add api-test-API_TOKEN --data-file=- --quiet", TEST_VALUE],
  ]);
  assert.equal(lastLine(r.stdout), "Every value is stored somewhere.");
  noValue(seen(r));
});

test("AC-537-2: WHEN --service, --region and --project are given THEN they reach gcloud, never a value", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run", "--env", "production", "--service", "shop", "--region", "us-east1", "--project", "my-proj-1"]);
  assert.equal(r.status, 0, seen(r));
  const argv = gcloud(r).map((c) => c.argv.map((a) => (a.startsWith("--flags-file=") ? "--flags-file=<file>" : a)).join(" "));
  assert.deepEqual(argv, [
    "secrets create shop-production-API_TOKEN --data-file=- --quiet --project=my-proj-1",
    "run services update shop-production --flags-file=<file> --quiet --region=us-east1 --project=my-proj-1",
  ]);
});

test("AC-537-2: WHEN a --service, --region or --project is not a plain name THEN nothing runs and nothing is stored", UNIX, () => {
  for (const bad of [["--service", "Bad Name"], ["--region", "us east"], ["--project", "x;y"]]) {
    const r = run(PUSH, goRepo(), ["--cloud-run", ...bad]);
    assert.equal(r.status, 1, bad.join(" "));
    assert.match(r.stderr, new RegExp(`${bad[0]} .* is not a plain name`), bad.join(" "));
    assert.deepEqual(r.calls, []);
  }
});

test("AC-537-3: WHEN gcloud fails for one name THEN the script exits non-zero, names it, and says it was stored nowhere, with no value", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run"], undefined, { FAKE_FAIL: "gcloud run services update", FAKE_ECHO: "1" });
  assert.equal(r.status, 1, seen(r));
  assert.match(r.stdout, /^production: FAILED SITE_URL as a Cloud Run variable \(service api-production\): invalid value: .*<hidden>/m);
  assert.match(r.stdout, /^production: set API_TOKEN as a Secret Manager secret/m, "the other names still went");
  assert.equal(lastLine(r.stdout), "Stored nowhere: SITE_URL (production). Keep .env.production.local until each one is stored.");
  assert.doesNotMatch(r.stdout, /Every value is stored somewhere/);
  noValue(seen(r));
});

test("AC-537-3: WHEN Secret Manager refuses both the create and the new version THEN the secret is named, both reasons are shown, and no value", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run", "--env", "test"], undefined, { FAKE_FAIL: "gcloud secrets", FAKE_ECHO: "1" });
  assert.equal(r.status, 1, seen(r));
  assert.match(r.stdout, /^test: FAILED API_TOKEN as a Secret Manager secret \(api-test-API_TOKEN\): create: invalid value: <hidden>; new version: invalid value: <hidden>$/m);
  assert.equal(lastLine(r.stdout), "Stored nowhere: API_TOKEN (test). Keep .env.test.local until each one is stored.");
  noValue(seen(r));
});

test("AC-537-3: WHEN --wrangler took a value and gcloud failed for it THEN the last line says it was only partly stored", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run", "--wrangler", "--env", "test"], undefined, { FAKE_FAIL: "gcloud secrets" });
  assert.equal(r.status, 1, seen(r));
  assert.match(r.stdout, /^test: set API_TOKEN as a Cloudflare secret$/m);
  assert.equal(lastLine(r.stdout), "Not stored everywhere (a destination FAILED above): API_TOKEN (test). Keep .env.test.local until each one is stored.");
});

test("AC-537-3: WHEN gcloud isn't on PATH THEN each name FAILED says so and the script exits non-zero", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run", "--env", "test"], undefined, { PATH: nodeOnly() });
  assert.equal(r.status, 1, seen(r));
  assert.match(r.stdout, /^test: FAILED API_TOKEN as a Secret Manager secret \(api-test-API_TOKEN\): gcloud isn't on your PATH$/m);
  assert.equal(lastLine(r.stdout), "Stored nowhere: API_TOKEN (test). Keep .env.test.local until each one is stored.");
});
