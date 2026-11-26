// Fakes for the push-secrets, setup-github and connect tests: a repo whose docs/stack.md says
// `ci`, fake `gh`, `npx` and `wrangler` on PATH that log every call, and test and production values.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmp } from "./helpers.mjs";

export const script = (path) => fileURLToPath(new URL(`../../.agents/skills/${path}`, import.meta.url));
export const PUSH = script("secrets/scripts/push-secrets.mjs");
export const SETUP = script("name/scripts/setup-github.mjs");
export const TEST_VALUE = "test-DO_NOT_PRINT-1";
export const LIVE_VALUE = "live-DO_NOT_PRINT-2";

// FAKE_FAIL: a call that starts with it (`npx wrangler secret put API_TOKEN --env production`)
// fails with an error that names no value.
const FAKE = `#!/usr/bin/env node
const fs = require("fs");
const argv = process.argv.slice(2);
let stdin = "";
try { stdin = fs.readFileSync(0, "utf8"); } catch { /* no stdin to read (closed, or a terminal that would block): the call had no input */ }
const cmd = require("path").basename(process.argv[1]);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd, argv, stdin }) + "\\n");
if (process.env.FAKE_FAIL && [cmd, ...argv].join(" ").startsWith(process.env.FAKE_FAIL)) {
  process.stderr.write("✘ [ERROR] Authentication error [code: 10000]\\n");
  process.exit(1);
}
const say = (text) => { process.stdout.write(text); process.exit(0); };
if (argv[0] === "api" && argv[1] === "user") say(JSON.stringify({ login: "me", id: 1 }));
if (argv.some((a) => a.endsWith("/commits/HEAD"))) say("abc123\\n");
if (argv[0] === "api" && argv.includes("--jq")) say("private\\n");
if (argv[0] === "api" && argv.some((a) => a.endsWith("/rulesets"))) say("[]");
`;

/** Puts the fake gh, npx and wrangler in `dir`/bin. */
export function fakeBin(dir) {
  mkdirSync(join(dir, "bin"), { recursive: true });
  for (const name of ["gh", "npx", "wrangler"]) {
    writeFileSync(join(dir, "bin", name), FAKE);
    chmodSync(join(dir, "bin", name), 0o755);
  }
}

/** The .env files push-secrets reads, in `dir`. */
export function envFiles(dir) {
  writeFileSync(join(dir, ".env.example"), "# scope: test,production\nAPI_TOKEN=\n# scope: production, secret: no\nSITE_URL=\n");
  writeFileSync(join(dir, ".env.test.local"), `API_TOKEN=${TEST_VALUE}\n`);
  writeFileSync(join(dir, ".env.production.local"), `API_TOKEN=${LIVE_VALUE}\nSITE_URL=https://example.com\n`);
}

/** A repo whose docs/stack.md says `ci`, with the fakes, and test and production values. */
export function repo(ci = "local", stack = `## CI\n\nci = "${ci}"\n`, { git = true } = {}) {
  const dir = tmp("onrails-ci-local-");
  fakeBin(dir);
  if (git) {
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/acme/app.git"]);
  }
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs", "stack.md"), stack);
  envFiles(dir);
  return dir;
}

/** The environment a run gets: the fakes first on PATH, their call log in `base`. */
export const fakeEnv = (base, more = {}) => ({
  ...process.env,
  PATH: `${join(base, "bin")}:${process.env.PATH}`,
  FAKE_LOG: join(base, "calls.jsonl"),
  HOME: base,
  ...more,
});

/** Every call the fakes logged in `base`. */
export function calls(base) {
  const log = join(base, "calls.jsonl");
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
}

/** Runs `file` in `dir`, with the fakes and their call log from `base` (the repo() folder). */
export function run(file, dir, args, base = dir, env = {}) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd: dir, encoding: "utf8", input: "", env: fakeEnv(base, env) });
  return { ...r, calls: calls(base) };
}

// The fakes are shebang scripts, which Windows can't run.
export const UNIX = { skip: process.platform === "win32" };
export const gh = (calls) => calls.filter((c) => c.cmd === "gh");
/** The last line a script printed. */
export const lastLine = (stdout) => stdout.trim().split("\n").at(-1);
