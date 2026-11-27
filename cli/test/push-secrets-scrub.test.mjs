// #161: a failing tool that echoes the value it was given never gets that value printed by push-secrets.
// The fakes in secrets-fakes.mjs log every call; no real tool runs, and every value is fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_VALUE, PUSH, repo, run, UNIX } from "./secrets-fakes.mjs";

test("AC-1: WHEN a fake wrangler fails and echoes the value in stderr THEN push-secrets prints the FAILED line without the value", UNIX, () => {
  const dir = repo("local");
  const r = run(PUSH, dir, ["--wrangler", "--env", "production"], dir, { FAKE_FAIL: "npx wrangler secret put API_TOKEN", FAKE_ECHO: "1" });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /production: FAILED API_TOKEN as a Cloudflare secret: invalid value: <hidden>/);
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

test("AC-1: WHEN a fake gh fails and echoes a secret or a plain variable in stderr THEN push-secrets prints the FAILED lines without the values", UNIX, () => {
  const dir = repo("actions");
  const r = run(PUSH, dir, ["--env", "production"], dir, { FAKE_FAIL: "gh", FAKE_ECHO: "1" });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /production: FAILED API_TOKEN as a GitHub secret \([^)]*\): invalid value: <hidden>/);
  assert.match(r.stdout, /production: FAILED SITE_URL as a GitHub variable \([^)]*\): invalid value: <hidden>/);
  assert.ok(!(r.stdout + r.stderr).includes(LIVE_VALUE) && !r.stdout.includes("https://example.com"));
});
