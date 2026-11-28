// #139: on ci = "local" (docs/stack.md) nothing reads GitHub's environments or secrets, so
// push-secrets and setup-github write none of them. The fakes in secrets-fakes.mjs log every call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gh, LIVE_VALUE, PUSH, repo, run, script, SETUP, TEST_VALUE, UNIX } from "./secrets-fakes.mjs";

test("#139: push-secrets on ci = local writes nothing to GitHub, and says where values go instead", UNIX, () => {
  const dir = repo();
  const r = run(PUSH, dir, []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.calls, [], "no gh call at all, not even SECRETS_MODE");
  assert.match(r.stdout, /ci = "local" \(docs\/stack\.md\): nothing goes to GitHub\. Secrets go to Cloudflare with --wrangler/);
});

test("#139: push-secrets --wrangler on ci = local sets only the Cloudflare secrets, values on stdin, never printed", UNIX, () => {
  const dir = repo();
  const r = run(PUSH, dir, ["--wrangler"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(gh(r.calls), []);
  assert.deepEqual(r.calls.map((c) => [c.cmd, c.argv.join(" "), c.stdin]), [
    ["npx", "wrangler secret put API_TOKEN --env test", TEST_VALUE],
    ["npx", "wrangler secret put API_TOKEN --env production", LIVE_VALUE],
  ]);
  assert.match(r.stdout, /production: set API_TOKEN as a Cloudflare secret/);
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

test("#139: push-secrets still writes GitHub environments on ci = actions", UNIX, () => {
  const dir = repo("actions");
  const r = run(PUSH, dir, []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(gh(r.calls).filter((c) => c.argv[1] === "set").map((c) => c.argv.join(" ")), [
    "secret set API_TOKEN --env test",
    "secret set API_TOKEN --env production",
    "variable set SITE_URL --env production --body https://example.com",
  ]);
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

test("#139: setup-github on ci = local makes no environments and no SECRETS_MODE, and says why", UNIX, () => {
  for (const plan of ["free", "team", "enterprise"]) {
    const dir = repo();
    const r = run(SETUP, dir, ["--plan", plan]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const calls = gh(r.calls).map((c) => c.argv.join(" "));
    assert.deepEqual(calls.filter((c) => /environments|SECRETS_MODE/.test(c)), [], plan);
    assert.match(r.stdout, /skipped\s+environment: test \(deploys from main\)\s+.*ci = "local": the session deploys read nothing from GitHub/, plan);
    assert.match(r.stdout, /Next: put production keys in Cloudflare/, plan);
  }
  const free = run(SETUP, repo(), ["--plan", "free"]);
  assert.match(free.stdout, /skipped\s+secrets mode: repository/);
  assert.match(free.stdout, /Secrets live in Cloudflare and \.env\.cloudflare\.local, never in GitHub/);
});

test("#139: setup-github on ci = actions still makes the environments", UNIX, () => {
  const dir = repo("actions");
  const r = run(SETUP, dir, ["--plan", "team"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const puts = gh(r.calls).flatMap((c) => (c.argv.includes("PUT") ? c.argv.filter((a) => a.includes("/environments/")) : []));
  assert.deepEqual(puts, ["repos/acme/app/environments/test", "repos/acme/app/environments/production"]);
});

test("#139: push-secrets on ci = local without --wrangler names every value it stored nowhere, and says to keep the files", UNIX, () => {
  const r = run(PUSH, repo(), []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /production: API_TOKEN is stored nowhere \(a secret, and nothing takes one on ci = "local" without --wrangler\)/);
  assert.equal(
    r.stdout.trim().split("\n").at(-1),
    "Stored nowhere: API_TOKEN (test), API_TOKEN (production), SITE_URL (production). Keep .env.test.local and .env.production.local until each one is stored.",
  );
  assert.doesNotMatch(r.stdout, /Every value is stored somewhere/);
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

test("#139: push-secrets --wrangler on ci = local still names the plain variable it stored nowhere", UNIX, () => {
  const r = run(PUSH, repo(), ["--wrangler"]);
  assert.match(r.stdout, /production: SITE_URL is stored nowhere \(a plain variable: it goes in wrangler\.jsonc vars\)/);
  assert.equal(r.stdout.trim().split("\n").at(-1), "Stored nowhere: SITE_URL (production). Keep .env.production.local until each one is stored.");
  const dry = run(PUSH, repo(), ["--wrangler", "--dry-run"]);
  assert.equal(dry.stdout.trim().split("\n").at(-1), "Would store nowhere: SITE_URL (production). Keep .env.production.local until each one is stored.");
});

test("#139: push-secrets says every value is stored only when each one went somewhere", UNIX, () => {
  assert.equal(run(PUSH, repo("actions"), []).stdout.trim().split("\n").at(-1), "Every value is stored somewhere.");
  assert.equal(run(PUSH, repo("actions"), ["--dry-run"]).stdout.trim().split("\n").at(-1), "Every value would be stored somewhere.");
});

test("#139: the secrets skill offers to delete .env.production.local only after push-secrets says every value is stored", () => {
  const skill = readFileSync(script("secrets/SKILL.md"), "utf8");
  const step = skill.slice(skill.indexOf("4. Show the list"), skill.indexOf("6. **Check it works.**"));
  assert.match(step, /`Every value is stored somewhere\.`/, "the offer waits for the script's own line");
  assert.match(step, /`Stored nowhere: \.\.\.`/);
  assert.match(step, /keep the file/i);
  assert.match(step, /On Full automation/);
  for (const line of ["Every value is stored somewhere.", "Stored nowhere"])
    assert.ok(readFileSync(PUSH, "utf8").includes(line), `push-secrets prints "${line}"`);
});

// docs/stack.md text → the CI it names. The same cases as the TanStack pack's local-keys.test.ts.
const CI_CASES = [
  ['## CI\n\nci = "actions"\n', "actions"],
  ['ci="actions"', "actions"],
  ['ci = "actions"  # turned on by the person\n', "actions"],
  ['ci = "actions"\r\n', "actions"],
  ['ci = "local"\n', "local"],
  ["", "local"],
  ['# ci = "actions" was turned off\nci = "local"\n', "local"],
  ['ci = "actions-later"\n', "local"],
];

test("#139: push-secrets and setup-github read ci by the same cases as the pack, a trailing comment allowed", UNIX, () => {
  for (const [stack, ci] of CI_CASES) {
    const pushed = gh(run(PUSH, repo("local", stack), []).calls).filter((c) => c.argv[1] === "set");
    assert.equal(pushed.length ? "actions" : "local", ci, `push-secrets: ${JSON.stringify(stack)}`);
    const made = gh(run(SETUP, repo("local", stack), ["--plan", "team"]).calls).filter((c) => c.argv.includes("PUT") && c.argv.some((a) => a.includes("/environments/")));
    assert.equal(made.length ? "actions" : "local", ci, `setup-github: ${JSON.stringify(stack)}`);
  }
});

test("#139: the three ci readers use one rule, character for character", () => {
  const rule = /^const CI_ACTIONS = (\/.+\/m);?$/m;
  const pack = fileURLToPath(new URL("../../stacks/tanstack-start/scripts/cloudflare/ci-mode.ts", import.meta.url));
  const rules = [PUSH, SETUP, pack].map((file) => rule.exec(readFileSync(file, "utf8"))?.[1]);
  assert.ok(rules[0], "push-secrets has the rule");
  assert.deepEqual(rules, [rules[0], rules[0], rules[0]]);
});

test("#139: before git init, push-secrets reads only the app folder, never a docs/stack.md above it", UNIX, () => {
  const outer = repo("actions", 'ci = "actions"\n', { git: false });
  const app = join(outer, "app");
  mkdirSync(app);
  for (const name of [".env.example", ".env.test.local", ".env.production.local"]) writeFileSync(join(app, name), readFileSync(join(outer, name)));
  const r = run(PUSH, app, [], outer);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(gh(r.calls), []);
  assert.match(r.stdout, /ci = "local"/);
});

// #537: a repo with a go.mod keeps its keys with the Go service's host, so the messages name that host's flag.
const GO_MOD = "module example.com/app\n\ngo 1.26\n";

test("AC-537-5: WHEN the repo has a go.mod THEN setup-github's closing line names --cloud-run, and the web pack's still names --wrangler", UNIX, () => {
  const go = repo();
  writeFileSync(join(go, "go.mod"), GO_MOD);
  const r = run(SETUP, go, ["--plan", "team"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Next: put production keys with their host: push-secrets --cloud-run for the Go service, --wrangler for a web app on Cloudflare, never in the repo or GitHub\./);
  const web = run(SETUP, repo(), ["--plan", "team"]);
  assert.match(web.stdout, /Next: put production keys in Cloudflare \(pnpm connect, or push-secrets --wrangler\), never in the repo or GitHub\./);
  assert.doesNotMatch(web.stdout, /--cloud-run/);
});

test("AC-537-5: WHEN a go.mod sits above the app folder, inside the repo, THEN setup-github names --cloud-run too", UNIX, () => {
  const top = repo();
  writeFileSync(join(top, "go.mod"), GO_MOD);
  const app = join(top, "services", "api");
  mkdirSync(app, { recursive: true });
  const r = run(SETUP, app, ["--plan", "team"], top);
  assert.match(r.stdout, /push-secrets --cloud-run for the Go service/);
});

test("AC-537-5: WHEN the repo has a go.mod and ci = local THEN push-secrets names --cloud-run where it says where values go, and for a value stored nowhere", UNIX, () => {
  const go = repo();
  writeFileSync(join(go, "go.mod"), GO_MOD);
  const r = run(PUSH, go, []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ci = "local" \(docs\/stack\.md\): nothing goes to GitHub\. Secrets go to Secret Manager with --cloud-run \(or to Cloudflare with --wrangler\); plain variables go to the Cloud Run service with --cloud-run\./);
  assert.match(r.stdout, /production: API_TOKEN is stored nowhere \(a secret, and nothing takes one on ci = "local" without --cloud-run or --wrangler\)/);
  assert.match(r.stdout, /production: SITE_URL is stored nowhere \(a plain variable: --cloud-run sets it on the Cloud Run service\)/);
  assert.doesNotMatch(r.stdout, /wrangler\.jsonc/);
});
