// #537: push-secrets --cloud-run puts a Go service's values on Google Cloud Run: secrets in Secret Manager, plain
// variables in the service's environment. A fake gcloud (secrets-fakes.mjs) logs every call; the real one never runs,
// and every value is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "./child.mjs";
import { nodeOnly, safeEnv, tmp } from "./helpers.mjs";
import { LIVE_VALUE, PUSH, envFiles, fakeBin, lastLine, repo, run, TEST_VALUE, UNIX } from "./secrets-fakes.mjs";

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
  assert.match(r.stdout, /^test: would set API_TOKEN as a Secret Manager secret \(api-test-API_TOKEN\) in gcloud's active project$/m);
  assert.match(r.stdout, /^production: would set API_TOKEN as a Secret Manager secret \(api-production-API_TOKEN\) in gcloud's active project$/m);
  assert.match(r.stdout, /^production: would set SITE_URL as a Cloud Run variable \(service api-production\) in gcloud's active project, gcloud's default region$/m);
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

test("AC-537-1: WHEN --project and --region are given with --dry-run THEN each name says where it would go", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--dry-run", "--cloud-run", "--env", "production", "--project", "my-proj-1", "--region", "us-east1"]);
  assert.equal(r.status, 0, seen(r));
  assert.match(r.stdout, /^production: would set API_TOKEN as a Secret Manager secret \(api-production-API_TOKEN\) in project my-proj-1$/m);
  assert.match(r.stdout, /^production: would set SITE_URL as a Cloud Run variable \(service api-production\) in project my-proj-1, region us-east1$/m);
  assert.deepEqual(r.calls, []);
});

test("AC-537-2: WHEN a flag is written --name=value THEN nothing runs and nothing is stored, so a push never goes to the wrong service", UNIX, () => {
  for (const bad of ["--service=zzz-svc", "--region=zzz-region", "--project=zzz-proj", "--env=production"]) {
    const r = run(PUSH, goRepo(), ["--cloud-run", bad]);
    assert.equal(r.status, 1, bad);
    assert.match(r.stderr, new RegExp(`${bad.split("=")[0]}=\\.\\.\\. is not understood: write the flag and its value as two words`), bad);
    assert.doesNotMatch(r.stderr, new RegExp(bad.split("=")[1]), "the value is not echoed");
    assert.deepEqual(r.calls, [], bad);
    assert.equal(r.stdout, "", bad);
  }
});

test("AC-537-2: WHEN the flags file is made THEN it is mode 600 inside a folder of mode 700, and the folder is gone after the call", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run", "--env", "production"]);
  assert.equal(r.status, 0, seen(r));
  const update = gcloud(r).find((c) => c.argv[0] === "run");
  assert.deepEqual(update.modes, [{ file: "600", dir: "700" }]);
  const file = update.argv.find((a) => a.startsWith("--flags-file=")).slice("--flags-file=".length);
  assert.equal(existsSync(file.slice(0, file.lastIndexOf("/"))), false, "the folder is gone too");
});

test("AC-537-3: WHEN gcloud fails for the plain variable THEN the flags file and its folder are gone after the failed call", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run", "--env", "production"], undefined, { FAKE_FAIL: "gcloud run services update" });
  assert.equal(r.status, 1, seen(r));
  const update = gcloud(r).find((c) => c.argv[0] === "run");
  const file = update.argv.find((a) => a.startsWith("--flags-file=")).slice("--flags-file=".length);
  assert.equal(existsSync(file), false, "the file is gone");
  assert.equal(existsSync(file.slice(0, file.lastIndexOf("/"))), false, "the folder is gone");
});

test("AC-537-3: WHEN the temp folder can't be made THEN that name FAILED with no value, the other names still go, and the last line says stored nowhere", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run"], undefined, { TMPDIR: "/nonexistent-dir-for-537" });
  assert.equal(r.status, 1, seen(r));
  assert.doesNotMatch(r.stderr, /at .*\.mjs|node:internal/, "no stack trace");
  assert.match(r.stdout, /^production: FAILED SITE_URL as a Cloud Run variable \(service api-production\): could not use a temporary folder for the flags file \(ENOENT\)$/m);
  assert.match(r.stdout, /^test: set API_TOKEN as a Secret Manager secret/m, "the names before it went");
  assert.match(r.stdout, /^production: set API_TOKEN as a Secret Manager secret/m, "the names after it were still tried");
  assert.deepEqual(gcloud(r).map((c) => c.argv[0]), ["secrets", "secrets"], "no gcloud call for the name that failed");
  assert.equal(lastLine(r.stdout), "Stored nowhere: SITE_URL (production). Keep .env.production.local until each one is stored.");
  assert.doesNotMatch(r.stdout, /Every value is stored somewhere/);
  noValue(seen(r));
});

test("AC-537-3: WHEN the temp folder can't be written THEN a plain variable that comes first does not stop the later names", UNIX, () => {
  const dir = goRepo();
  // A plain variable listed before a secret: the later secret must still be tried after the plain one failed.
  writeFileSync(join(dir, ".env.example"), "# scope: production, secret: no\nSITE_URL=\n# scope: production\nAPI_TOKEN=\n");
  const r = run(PUSH, dir, ["--cloud-run", "--env", "production"], undefined, { TMPDIR: "/nonexistent-dir-for-537" });
  assert.equal(r.status, 1, seen(r));
  assert.match(r.stdout, /^production: FAILED SITE_URL as a Cloud Run variable/m);
  assert.match(r.stdout, /^production: set API_TOKEN as a Secret Manager secret/m);
  assert.equal(lastLine(r.stdout), "Stored nowhere: SITE_URL (production). Keep .env.production.local until each one is stored.");
});

test("AC-537-3: WHEN gcloud echoes a value in its JSON-escaped form THEN that form is hidden too", UNIX, () => {
  const dir = goRepo();
  const tricky = 'https://example.com/a"b\\c';
  writeFileSync(join(dir, ".env.production.local"), `API_TOKEN=${LIVE_VALUE}\nSITE_URL=${tricky}\n`);
  const r = run(PUSH, dir, ["--cloud-run", "--env", "production"], undefined, { FAKE_FAIL: "gcloud run services update", FAKE_ECHO: "1" });
  assert.equal(r.status, 1, seen(r));
  // The fake echoes the flags file, which holds the value as JSON writes it: a" as a\" and a backslash doubled.
  assert.match(r.stdout, /^production: FAILED SITE_URL as a Cloud Run variable \(service api-production\): invalid value: \{"--update-env-vars":\{"SITE_URL":"<hidden>"\}\}$/m);
  for (const form of [tricky, JSON.stringify(tricky).slice(1, -1), "a\\\"b"]) assert.ok(!seen(r).includes(form), `no ${form}`);
});

test("AC-537-5: WHEN a go.mod sits above the .git folder THEN it is ignored and the messages stay as for a web app", UNIX, () => {
  const outer = tmp("onrails-go-above-");
  writeFileSync(join(outer, "go.mod"), "module example.com/other\n\ngo 1.26\n");
  const app = join(outer, "app");
  mkdirSync(join(app, "docs"), { recursive: true });
  execFileSync("git", ["init", "-q", app], { env: safeEnv() });
  writeFileSync(join(app, "docs", "stack.md"), '## CI\n\nci = "local"\n');
  fakeBin(app);
  envFiles(app);
  const r = run(PUSH, app, []);
  assert.equal(r.status, 0, seen(r));
  assert.match(r.stdout, /Secrets go to Cloudflare with --wrangler; plain variables belong in wrangler\.jsonc vars\./);
  assert.doesNotMatch(r.stdout, /cloud-run/);
});

// #583: a flag that needs a value and has none must stop the run, not fall back to gcloud's active project or region.
for (const flagName of ["--service", "--region", "--project"]) {
  test(`AC-583-1: WHEN ${flagName} is the last word with no value THEN it exits 1 before any gcloud call, names the flag and prints no value`, UNIX, () => {
    const r = run(PUSH, goRepo(), ["--cloud-run", flagName]);
    assert.equal(r.status, 1, seen(r));
    assert.deepEqual(r.calls, [], "no tool started");
    assert.match(r.stderr, new RegExp(`${flagName} needs a value`));
    assert.doesNotMatch(r.stdout, /: set |would set|FAILED/, "nothing was listed or pushed");
    noValue(seen(r));
  });
}

test("AC-583-1: WHEN a dry run ends with --project and no value THEN it exits 1 and lists no name", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--dry-run", "--env", "test", "--cloud-run", "--project"]);
  assert.equal(r.status, 1, seen(r));
  assert.match(r.stderr, /--project needs a value/);
  assert.doesNotMatch(r.stdout, /would set/);
});

test("AC-583-1: WHEN --region is followed by another flag word THEN that word is no value and the run exits 1 before any gcloud call", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--cloud-run", "--region", "--env", "test"]);
  assert.equal(r.status, 1, seen(r));
  assert.deepEqual(r.calls, [], "no tool started");
  assert.match(r.stderr, /--region needs a value/);
  assert.doesNotMatch(seen(r), /--env/, "the word after the flag is not echoed");
});

test("AC-583-1: WHEN each flag has its value THEN the run goes on as before", UNIX, () => {
  const r = run(PUSH, goRepo(), ["--dry-run", "--cloud-run", "--service", "shop", "--region", "europe-west1", "--project", "my-project", "--env", "production"]);
  assert.equal(r.status, 0, seen(r));
  assert.match(r.stdout, /would set SITE_URL as a Cloud Run variable \(service shop-production\) in project my-project, region europe-west1/);
});

test("AC-583-2: WHEN gcloud echoes a plain variable's value in Python repr form (a backslash doubled, quotes kept) THEN it shows <hidden> and the value in no form", UNIX, () => {
  const dir = goRepo();
  const tricky = 'https://example.com/a"b\\c';
  writeFileSync(join(dir, ".env.production.local"), `API_TOKEN=${LIVE_VALUE}\nSITE_URL=${tricky}\n`);
  const pythonRepr = tricky.replaceAll("\\", "\\\\");
  const r = run(PUSH, dir, ["--cloud-run", "--env", "production"], undefined, { FAKE_FAIL: "gcloud run services update", FAKE_ECHO_TEXT: `invalid value: '${pythonRepr}'` });
  assert.equal(r.status, 1, seen(r));
  assert.match(r.stdout, /^production: FAILED SITE_URL as a Cloud Run variable \(service api-production\): invalid value: '<hidden>'$/m);
  for (const form of [tricky, JSON.stringify(tricky).slice(1, -1), pythonRepr]) assert.ok(!seen(r).includes(form), `no ${form}`);
});
