// GitHub Free, private repo (#14): no environments, so setup-github sets SECRETS_MODE=repository
// and push-secrets writes repository secrets named TEST_<name> and PRODUCTION_<name>, the names
// the TanStack Start pack's workflows read in that mode. A fake `gh` on PATH logs every call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmp } from "./helpers.mjs";

const script = (path) => fileURLToPath(new URL(`../../.agents/skills/${path}`, import.meta.url));
const PUSH = script("secrets/scripts/push-secrets.mjs");
const SETUP = script("name/scripts/setup-github.mjs");

const FAKE_GH = `#!/usr/bin/env node
const fs = require("fs");
const argv = process.argv.slice(2);
let stdin = "";
try { stdin = fs.readFileSync(0, "utf8"); } catch {}
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ argv, stdin }) + "\\n");
const say = (text) => { process.stdout.write(text); process.exit(0); };
if (argv[0] === "variable" && argv[1] === "get") {
  if (process.env.FAKE_SECRETS_MODE) say(process.env.FAKE_SECRETS_MODE + "\\n");
  process.exit(1);
}
if (argv[0] === "api" && argv[1] === "user") say(JSON.stringify({ login: "me", id: 1 }));
if (argv[0] === "api" && argv.includes("--jq")) say((process.env.FAKE_VISIBILITY || "private") + "\\n");
if (argv[0] === "api" && argv.some((a) => a.endsWith("/rulesets"))) say("[]");
`;

function repo() {
  const dir = tmp("onrails-secrets-");
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "gh"), FAKE_GH);
  chmodSync(join(dir, "bin", "gh"), 0o755);
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/acme/app.git"]);
  writeFileSync(join(dir, ".env.example"), "# scope: test,production\nAPI_TOKEN=\n# scope: production, secret: no\nSITE_URL=\n");
  writeFileSync(join(dir, ".env.test.local"), "API_TOKEN=test-value-1\n");
  writeFileSync(join(dir, ".env.production.local"), "API_TOKEN=live-value-2\nSITE_URL=https://example.com\n");
  // GitHub secrets and SECRETS_MODE are for GitHub Actions only (#139): ci = "local" is in ci-local-secrets.test.mjs.
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs", "stack.md"), 'ci = "actions"\n');
  return dir;
}

function run(file, dir, args, env = {}) {
  const r = spawnSync(process.execPath, [file, ...args], {
    cwd: dir,
    encoding: "utf8",
    input: "",
    env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, FAKE_LOG: join(dir, "calls.jsonl"), HOME: dir, ...env },
  });
  let calls = [];
  try {
    calls = readFileSync(join(dir, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  } catch {}
  return { ...r, calls };
}
// The fake gh is a shebang script, which Windows can't run.
const UNIX = { skip: process.platform === "win32" };
const sets = (calls) => calls.filter((c) => c.argv[1] === "set").map((c) => [c.argv.join(" "), c.stdin]);

test("push-secrets writes to the test and production environments when SECRETS_MODE is not set", UNIX, () => {
  const dir = repo();
  const r = run(PUSH, dir, []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(sets(r.calls), [
    ["secret set API_TOKEN --env test", "test-value-1"],
    ["secret set API_TOKEN --env production", "live-value-2"],
    ["variable set SITE_URL --env production --body https://example.com", ""],
  ]);
});

test("push-secrets writes TEST_ and PRODUCTION_ repository names when SECRETS_MODE is repository", UNIX, () => {
  const dir = repo();
  const r = run(PUSH, dir, [], { FAKE_SECRETS_MODE: "repository" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /SECRETS_MODE is "repository"/);
  assert.deepEqual(sets(r.calls), [
    ["secret set TEST_API_TOKEN", "test-value-1"],
    ["secret set PRODUCTION_API_TOKEN", "live-value-2"],
    ["variable set PRODUCTION_SITE_URL --body https://example.com", ""],
  ]);
  assert.match(r.stdout, /production: set API_TOKEN as a GitHub secret \(repository as PRODUCTION_API_TOKEN\)/);
  assert.doesNotMatch(r.stdout, /live-value-2|test-value-1/);
});

test("push-secrets --dry-run names the repository-mode targets and writes nothing", UNIX, () => {
  const dir = repo();
  const r = run(PUSH, dir, ["--dry-run"], { FAKE_SECRETS_MODE: "repository" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /test: would set API_TOKEN as a GitHub secret \(repository as TEST_API_TOKEN\)/);
  assert.deepEqual(sets(r.calls), []);
});

test("setup-github sets SECRETS_MODE=repository on a free private repo and says what is lost", UNIX, () => {
  const dir = repo();
  const r = run(SETUP, dir, ["--plan", "free"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(sets(r.calls).filter(([a]) => a.startsWith("variable")), [["variable set SECRETS_MODE --body repository --repo acme/app", ""]]);
  assert.match(r.stdout, /done\s+secrets mode: repository/);
  assert.match(r.stdout, /no required reviewer and no main-only rule/);
  assert.match(r.stdout, /"deploy production"/);
});

test("setup-github leaves SECRETS_MODE alone on a public repo or a paid plan", UNIX, () => {
  for (const [plan, visibility] of [["free", "public"], ["team", "private"]]) {
    const dir = repo();
    const r = run(SETUP, dir, ["--plan", plan], { FAKE_VISIBILITY: visibility });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(r.calls.filter((c) => c.argv[0] === "variable"), [], `${plan} ${visibility}`);
  }
});

test("setup-github's dry run only says it would set SECRETS_MODE", UNIX, () => {
  const dir = repo();
  const r = run(SETUP, dir, ["--plan", "free", "--dry-run"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /would do\s+secrets mode: repository/);
  assert.deepEqual(r.calls.filter((c) => c.argv[0] === "variable"), []);
});
