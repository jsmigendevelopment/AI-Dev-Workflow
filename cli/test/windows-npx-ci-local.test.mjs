// #237: two Windows routes #138 left open. push-secrets.mjs starts `npx` by its full path, and a Windows npx.cmd
// through cmd.exe from ComSpec; `ci local` starts git and gh by the full path the CLI's search finds, never a copy in
// the current folder. A fake win32 and a recorded spawn: nothing runs, and there is no Windows machine here.
import { test } from "node:test";
import assert from "node:assert/strict";
import childProcess, { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ciLocal } from "../src/ci-local.mjs";
import { logger, put, safeEnv, tmp } from "./helpers.mjs";
import { LIVE_VALUE, PUSH, repo, TEST_VALUE } from "./secrets-fakes.mjs";

const ComSpec = "C:\\Windows\\System32\\cmd.exe";
const PATHEXT = ".com;.exe;.bat;.cmd";

// Loaded with --import before push-secrets: the process says win32, its PATH is the fake Windows one, and
// execFileSync records what would start (file, arguments, stdin) instead of starting it.
const PRELOAD = `import cp from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
Object.defineProperty(process, "platform", { value: "win32" });
process.env.PATH = process.env.FAKE_WIN_PATH;
cp.execFileSync = (file, args, opts = {}) => {
  const started = { file, args, input: opts.input ?? null, verbatim: opts.windowsVerbatimArguments ?? false,
    noCurrentFolder: opts.env?.NoDefaultCurrentDirectoryInExePath ?? null };
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(started) + "\\n");
  return "";
};
syncBuiltinESMExports();
`;

/** Runs push-secrets in `dir` on a fake win32 whose PATH entries are `path`. Returns its output and what it started. */
function pushOnWindows(dir, path, args = ["--wrangler"]) {
  const base = tmp("onrails-win-push-");
  put(base, "preload.mjs", PRELOAD);
  const log = join(base, "starts.jsonl");
  const env = safeEnv({ FAKE_LOG: log, FAKE_WIN_PATH: path.join(";"), PATHEXT, ComSpec });
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(join(base, "preload.mjs")).href, PUSH, ...args], { cwd: dir, encoding: "utf8", input: "", env });
  const starts = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
  return { ...r, starts };
}

/** npm's three shims for npx in one folder, as a Windows Node install has them. */
function npmFolder(prefix = "onrails-npm-") {
  const npm = tmp(prefix);
  for (const name of ["npx", "npx.cmd", "npx.ps1"]) put(npm, name, "shim\n");
  return npm;
}

test("AC-237-1: WHEN push-secrets.mjs runs on a fake win32 with npx.cmd THEN it starts npx.cmd through cmd.exe by full path, and the value goes in only through stdin", () => {
  const dir = repo();
  const npm = npmFolder();
  // Copies the repo ships, in a PATH folder inside it and in the current folder (a relative entry): never started.
  for (const path of ["tools/npx.cmd", "npx.cmd", "npx.exe"]) put(dir, path, "the repo's own\n");
  const r = pushOnWindows(dir, [join(dir, "tools"), ".", npm]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const line = (env) => `""${join(npm, "npx.cmd")}" wrangler secret put API_TOKEN --env ${env}"`;
  assert.deepEqual(r.starts, [
    { file: ComSpec, args: ["/d", "/s", "/c", line("test")], input: TEST_VALUE, verbatim: true, noCurrentFolder: "1" },
    { file: ComSpec, args: ["/d", "/s", "/c", line("production")], input: LIVE_VALUE, verbatim: true, noCurrentFolder: "1" },
  ]);
  assert.match(r.stdout, /test: set API_TOKEN as a Cloudflare secret/);
  assert.match(r.stdout, /production: set API_TOKEN as a Cloudflare secret/);
  for (const value of [TEST_VALUE, LIVE_VALUE]) {
    assert.ok(!r.starts.some((s) => [s.file, ...s.args].join(" ").includes(value)), "a value in a command's arguments");
  }
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

test("AC-237-1: WHEN npx is found only inside the repo or through a relative PATH entry THEN push-secrets starts nothing, says why and keeps the file", () => {
  const dir = repo();
  for (const path of ["tools/npx.cmd", "npx.cmd"]) put(dir, path, "the repo's own\n");
  const r = pushOnWindows(dir, [join(dir, "tools"), "."]);
  assert.deepEqual(r.starts, []);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /test: FAILED API_TOKEN as a Cloudflare secret: npx found only inside this repo, not run/);
  assert.match(r.stdout, /Keep \.env\.test\.local and \.env\.production\.local until each one is stored\./);
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

test("AC-237-1: WHEN the only npx.cmd sits in a folder whose path holds % THEN push-secrets doesn't hand it to cmd.exe", () => {
  const dir = repo();
  const npm = npmFolder("onrails-npm-%PATH%-");
  const r = pushOnWindows(dir, [npm], ["--wrangler", "--env", "test"]);
  assert.deepEqual(r.starts, []);
  assert.match(r.stdout, /test: FAILED API_TOKEN as a Cloudflare secret: cmd\.exe would expand the % in /);
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

// ci local's whole run, on a fake win32 whose spawnSync records each start and answers from this table.
const ANSWERS = {
  "git rev-parse --show-toplevel": (dir) => dir,
  "git remote get-url origin": () => "https://github.com/acme/app.git",
  "git symbolic-ref --short refs/remotes/origin/HEAD": () => "origin/main",
  "gh api repos/acme/app": () => JSON.stringify({ default_branch: "main" }),
  "git status --porcelain": () => " D .github/workflows/ci.yml",
  "gh api --method POST repos/acme/app/issues": () => JSON.stringify({ number: 7 }),
  "gh api --method POST repos/acme/app/pulls": () => JSON.stringify({ number: 8, html_url: "https://github.com/acme/app/pull/8" }),
};

/** Runs fn in `dir` as the current folder, with this process on a fake win32 and spawnSync recorded. */
async function onWindows(dir, path, fn) {
  const starts = [];
  const real = { spawnSync: childProcess.spawnSync, platform: Object.getOwnPropertyDescriptor(process, "platform"), cwd: process.cwd() };
  const saved = Object.fromEntries(["PATH", "PATHEXT", "ComSpec"].map((key) => [key, process.env[key]]));
  childProcess.spawnSync = (file, args, opts = {}) => {
    starts.push({ file, args, cwd: opts.cwd });
    const tool = basename(file).replace(/\.(exe|cmd)$/i, "");
    const line = [tool, ...args].join(" ");
    const answer = Object.entries(ANSWERS).find(([start]) => line.startsWith(start))?.[1];
    return { status: 0, signal: null, stdout: answer ? `${answer(dir)}\n` : "", stderr: "" };
  };
  syncBuiltinESMExports();
  Object.defineProperty(process, "platform", { value: "win32" });
  const fake = { PATH: path.join(delimiter), PATHEXT, ComSpec };
  for (const [key, value] of Object.entries(fake)) process.env[key] = value;
  process.chdir(dir);
  try {
    return { code: await fn(), starts };
  } finally {
    process.chdir(real.cwd);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    Object.defineProperty(process, "platform", real.platform);
    childProcess.spawnSync = real.spawnSync;
    syncBuiltinESMExports();
  }
}

/** A repo folder with a workflow, holding its own git.exe and gh.exe, and a tools folder outside it with the real ones. */
function windowsRepo() {
  const dir = tmp("onrails-win-ci-");
  put(dir, ".github/workflows/ci.yml", "on: push\n");
  put(dir, "docs/stack.md", "# Stack\n");
  for (const name of ["git.exe", "gh.exe"]) put(dir, name, "the repo's own\n");
  const tools = tmp("onrails-win-tools-");
  for (const name of ["git.exe", "gh.exe"]) put(tools, name, "installed\n");
  return { dir, tools };
}

test("AC-237-2: WHEN ci local runs on a fake win32 with a git.exe in the current folder THEN that copy never runs", async () => {
  const { dir, tools } = windowsRepo();
  const log = logger();
  const { code, starts } = await onWindows(dir, [dir, ".", tools], () => ciLocal(".", { yes: true, log }));
  assert.equal(code, 0, log.text());
  assert.match(log.text(), /✓ Pull request: https:\/\/github\.com\/acme\/app\/pull\/8/);
  assert.ok(starts.some((s) => s.args[0] === "push"), "the run got as far as the push");
  const installed = [join(tools, "git.exe"), join(tools, "gh.exe")];
  for (const start of starts) assert.ok(installed.includes(start.file), `${start.file} ${start.args.join(" ")} is not the installed git or gh`);
});

test("AC-237-2: WHEN git.exe is only in the current folder THEN ci local starts nothing and says why", async () => {
  const { dir } = windowsRepo();
  const log = logger();
  const { code, starts } = await onWindows(dir, [dir, "."], () => ciLocal(".", { yes: true, log }));
  assert.equal(code, 1);
  assert.deepEqual(starts, []);
  assert.match(log.text(), /git found only inside (this project|the current folder), not run/);
});
