// #160: a partial failure never reads as "every value is stored", and the four `ci` readers agree
// on a nested docs/stack.md. The fakes in secrets-fakes.mjs log every call; no real tool runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "./child.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { safeEnv, tmp } from "./helpers.mjs";
import { calls, envFiles, fakeBin, fakeEnv, gh, lastLine, PUSH, run, script, SETUP, UNIX } from "./secrets-fakes.mjs";
import { readCi } from "../../stacks/tanstack-start/scripts/cloudflare/ci-mode.ts";
import { connect } from "../../stacks/tanstack-start/scripts/connect/run.ts";
import { DEMO } from "../../stacks/tanstack-start/scripts/connect/fakes.ts";

const WRANGLER_PROD = "npx wrangler secret put API_TOKEN --env production";

test("AC-160-1: WHEN push-secrets on ci = actions stores a value on GitHub but wrangler secret put fails THEN its last line doesn't say every value is stored, and it exits non-zero", UNIX, () => {
  const dir = makeRepo({ root: "actions" });
  const r = run(PUSH, dir, ["--wrangler"], dir, { FAKE_FAIL: WRANGLER_PROD });
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(gh(r.calls).some((c) => c.argv.join(" ") === "secret set API_TOKEN --env production"), "GitHub took the value");
  assert.match(r.stdout, /production: FAILED API_TOKEN as a Cloudflare secret/);
  assert.doesNotMatch(r.stdout, /Every value is stored somewhere/);
  assert.equal(
    lastLine(r.stdout),
    "Not stored everywhere (a destination FAILED above): API_TOKEN (production). Keep .env.production.local until each one is stored.",
  );
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

test("AC-160-1: WHEN push-secrets fails nowhere THEN it still ends with every value stored, and exits 0", UNIX, () => {
  const r = run(PUSH, makeRepo({ root: "actions" }), ["--wrangler"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(lastLine(r.stdout), "Every value is stored somewhere.");
});

test("AC-160-1: the secrets skill offers to delete .env.production.local only after that line AND exit 0, never on Full while a value is unstored", () => {
  const skill = readFileSync(script("secrets/SKILL.md"), "utf8");
  const step = skill.slice(skill.indexOf("5. Read its last line"), skill.indexOf("6. **Check it works.**"));
  assert.match(step, /Only `Every value is stored somewhere\.` with exit code 0 lets you offer to delete `\.env\.production\.local`/);
  assert.match(step, /`Not stored everywhere \(a destination FAILED above\): \.\.\.`/);
  assert.match(step, /A non-zero exit means a destination failed, whatever the last line says: keep the file/);
  assert.match(step, /On Full automation the offer stays a no while any value is unstored or the exit code isn't 0/);
});

// The nested case and its neighbours. Each fixture: what the repo root's and app/'s docs/stack.md
// say (null: no file), and what every reader must return when run from app/.
const FIXTURES = [
  { name: "root actions, app local", root: "actions", app: "local", want: "local" },
  { name: "root local, app actions", root: "local", app: "actions", want: "actions" },
  { name: "root actions, no app file", root: "actions", app: null, want: "actions" },
  { name: "root local, no app file", root: "local", app: null, want: "local" },
  { name: "no file anywhere", root: null, app: null, want: "local" },
];

/** A git repo with the fakes and providers at its root, and an app/ folder with the .env files. */
function makeRepo({ root, app }) {
  const dir = tmp("onrails-ci-nested-");
  fakeBin(dir);
  execFileSync("git", ["init", "-q", dir], { env: safeEnv() });
  execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/acme/app.git"], { env: safeEnv() });
  const providers = join(dir, ".agents", "skills", "secrets", "providers");
  mkdirSync(providers, { recursive: true });
  writeFileSync(join(providers, "demo.md"), DEMO);
  const stack = (folder, ci) => {
    if (!ci) return;
    mkdirSync(join(folder, "docs"), { recursive: true });
    writeFileSync(join(folder, "docs", "stack.md"), `## CI\n\nci = "${ci}"\n`);
  };
  stack(dir, root);
  if (app === undefined) return (envFiles(dir), dir);
  mkdirSync(join(dir, "app"));
  stack(join(dir, "app"), app);
  envFiles(join(dir, "app"));
  return dir;
}

/** What each of the four readers decided, run from `app`: "actions" or "local". */
async function readers(dir) {
  const app = join(dir, "app");
  const pushed = gh(run(PUSH, app, [], dir).calls).filter((c) => c.argv[1] === "set");
  const pushSecrets = pushed.length ? "actions" : "local";
  const before = calls(dir).length;
  const made = gh(run(SETUP, app, ["--plan", "team"], dir).calls.slice(before)).filter(
    (c) => c.argv.includes("PUT") && c.argv.some((a) => a.includes("/environments/")),
  );
  const setupGithub = made.length ? "actions" : "local";
  const out = [];
  const code = await connect(["--dry-run"], {
    stdin: { isTTY: false },
    stdout: { write: (text) => out.push(text) },
    cwd: app,
    platform: process.platform,
    env: fakeEnv(dir),
  });
  assert.equal(code, 0, out.join(""));
  const text = out.join("");
  const connectCi = text.includes('ci = "local" (docs/stack.md): nothing goes to GitHub.') ? "local" : text.includes("GitHub repository: acme/app") ? "actions" : "?";
  return { "ci-mode.ts": readCi(app), "push-secrets": pushSecrets, "setup-github": setupGithub, connect: connectCi };
}

for (const fixture of FIXTURES) {
  test(`AC-160-2: WHEN ${fixture.name}, run from app/ THEN all four readers return ${fixture.want}`, UNIX, async () => {
    const got = await readers(makeRepo(fixture));
    const want = fixture.want;
    assert.deepEqual(got, { "ci-mode.ts": want, "push-secrets": want, "setup-github": want, connect: want });
  });
}
