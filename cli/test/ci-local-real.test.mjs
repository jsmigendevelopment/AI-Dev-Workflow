// #200: `ci local` against a real git repo with a bare origin in the temp folder. Only gh is faked, and the remote's
// name: git answers `remote get-url origin` with a github.com URL while fetch and push go to the bare origin, so
// nothing reaches GitHub. AC-1: a committed symlink never takes the delete or the write outside the worktree.
// AC-2: an interrupt still removes the worktree. Round 1: a signal sent to the CLI's pid alone stops it before the
// next step, and a parent committed as a file stops it with a message. Every child gets an env from safeEnv() (#191).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "./child.mjs";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ciLocal, realRun } from "../src/ci-local.mjs";
import { findCommand } from "../src/system.mjs";
import { fakeGh, logger, put, safeEnv, tmp, unixOnly } from "./helpers.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "cli.mjs");
const FULL = "# Stack\n\n## Automation level\n\n- **Level:** full\n";
const ENV = safeEnv();
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** A repo whose main holds `files` ({ path: text }) and `links` ({ path: target }), pushed to a bare origin. */
function realRepo({ files = {}, links = {} } = {}) {
  const base = tmp("onrails-ci-real-");
  const dir = join(base, "app");
  const origin = join(base, "origin.git");
  git(base, "init", "-q", "--bare", "-b", "main", origin);
  git(base, "init", "-q", "-b", "main", dir);
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    symlinkSync(target, join(dir, path));
  }
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "root");
  git(dir, "remote", "add", "origin", origin);
  git(dir, "push", "-q", "-u", "origin", "main");
  git(dir, "remote", "set-head", "origin", "main");
  return { base, dir, origin };
}

const worktrees = (dir) => git(dir, "worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree "));

/** realRun for git, except the remote's name; gh answered from a table. Every call is in `calls`. */
function realGit() {
  const calls = [];
  const gh = {
    "api --method PUT repos/acme/app/actions/permissions -F enabled=false": { ok: true, out: "" },
    "api repos/acme/app": { ok: true, out: JSON.stringify({ default_branch: "main" }) },
  };
  const run = (cmd, args, opts) => {
    const line = args.join(" ");
    calls.push(`${cmd} ${line}`);
    if (cmd === "git" && line === "remote get-url origin") return { ok: true, out: "https://github.com/acme/app.git", err: "" };
    if (cmd === "gh") return gh[line] ?? { ok: true, out: JSON.stringify({ number: 7, html_url: "https://github.com/acme/app/pull/8" }), err: "" };
    return realRun(cmd, args, opts);
  };
  return { run, calls };
}

test("AC-200-1: WHEN the default branch has .github or docs committed as a symlink to a folder outside the worktree THEN ci local deletes and writes nothing there and stops with a message", async () => {
  const cases = {
    ".github": (out) => ({ links: { ".github": out }, canary: join(out, "workflows", "ci.yml") }),
    ".github/workflows": (out) => ({ links: { ".github/workflows": out }, canary: join(out, "ci.yml") }),
    docs: (out) => ({ links: { docs: out }, canary: join(out, "stack.md") }),
    "docs/stack.md": (out) => ({ links: { "docs/stack.md": join(out, "stack.md") }, canary: join(out, "stack.md") }),
  };
  for (const [link, make] of Object.entries(cases)) {
    const outside = tmp("onrails-outside-");
    const { links, canary } = make(outside);
    mkdirSync(dirname(canary), { recursive: true });
    writeFileSync(canary, "canary\n");
    const files = { "docs/stack.md": FULL, ".github/workflows/ci.yml": "on: push\n", ".github/ISSUE_TEMPLATE/bug.md": "a bug\n" };
    for (const path of Object.keys(files)) if (path === link || path.startsWith(`${link}/`)) delete files[path];
    const { dir } = realRepo({ files, links });
    const fake = realGit();
    const log = logger();
    assert.equal(await ciLocal(dir, { log, run: fake.run, yes: true }), 1, `${link}: ${log.text()}`);
    assert.equal(readFileSync(canary, "utf8"), "canary\n", `${link}: the file outside the worktree is left as it was`);
    assert.deepEqual(readdirSync(dirname(canary)), [canary.split("/").at(-1)], `${link}: nothing new is written outside`);
    assert.match(log.text(), new RegExp(`${link.replaceAll(".", "\\.")} is a symlink`), link);
    assert.deepEqual(fake.calls.filter((c) => /issues|pulls|git push|git commit/.test(c)), [], `${link}: no issue, commit or push`);
    assert.equal(worktrees(dir).length, 1, `${link}: the temp worktree is gone`);
  }
});

test("#200 round 1: WHEN .github is committed as a file THEN ci local stops with a message, not a stack trace, and opens nothing", async () => {
  const { dir } = realRepo({ files: { ".github": "not a folder\n", "docs/stack.md": FULL } });
  const fake = realGit();
  const log = logger();
  assert.equal(await ciLocal(dir, { log, run: fake.run, yes: true }), 1, log.text());
  assert.match(log.text(), /Stopped: \.github\/workflows can't be read \(ENOTDIR\)/);
  assert.deepEqual(fake.calls.filter((c) => /issues|pulls|git push|git commit/.test(c)), [], "no issue, commit or push");
  assert.equal(worktrees(dir).length, 1, "the temp worktree is gone");
});

// gh, faked for a child process, logging each call to CALLS: it turns Actions off and names main. On the issue it
// writes WAITING, waits ISSUE_WAIT ms, then answers #7, unless a signal stopped it first. A pull request answers with
// its link, so a run that went on would print "✓ Pull request".
const GH = `#!/usr/bin/env node
const fs = require("fs");
const line = process.argv.slice(2).join(" ");
fs.appendFileSync(process.env.CALLS, line + "\\n");
if (line.includes("--method PUT")) process.exit(0);
if (line === "api repos/acme/app") { process.stdout.write(JSON.stringify({ default_branch: "main" })); process.exit(0); }
if (line.includes("repos/acme/app/issues")) {
  fs.writeFileSync(process.env.WAITING, "1");
  setTimeout(() => process.stdout.write(JSON.stringify({ number: 7 })), Number(process.env.ISSUE_WAIT));
} else if (line.includes("repos/acme/app/pulls")) process.stdout.write(JSON.stringify({ html_url: "https://github.com/acme/app/pull/8" }));
else process.exit(1);
`;
// git, with only the remote's name changed, as above. A shell script that hands every other call to the real git, so
// the env the CLI got from safeEnv() reaches git as it is.
const GIT_SHIM = `#!/bin/sh
if [ "$*" = "remote get-url origin" ]; then echo https://github.com/acme/app.git; exit 0; fi
exec "$REAL_GIT" "$@"
`;

/** A repo with a workflow, and the CLI's env: the fake gh and the git shim first on a safe PATH, a temp TMPDIR. */
function cliRun(issueWait) {
  const { base, dir, origin } = realRepo({ files: { "docs/stack.md": FULL, ".github/workflows/ci.yml": "on: push\n" } });
  const temp = tmp("onrails-ci-temp-");
  const waiting = join(base, "waiting");
  const calls = join(base, "gh-calls.log");
  const extra = { REAL_GIT: findCommand("git"), WAITING: waiting, CALLS: calls, ISSUE_WAIT: String(issueWait), TMPDIR: temp, HOME: tmp("onrails-home-") };
  const { env } = fakeGh(base, {}, extra);
  for (const [name, script] of [["gh", GH], ["git", GIT_SHIM]]) {
    writeFileSync(join(base, "bin", name), script);
    chmodSync(join(base, "bin", name), 0o755);
  }
  return { dir, origin, temp, waiting, calls, env };
}

/** Starts `ci local --yes` in its own process group, so a test can signal that group or the CLI's pid alone. */
function startCli(dir, env) {
  const child = spawn(process.execPath, [CLI, "ci", "local", dir, "--yes"], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const out = { text: "" };
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (d) => (out.text += d));
  const exited = new Promise((done) => child.on("exit", (code, signal) => done({ code, signal })));
  // Only this test's own group, and only while the CLI hasn't been reaped.
  const kill = () => child.exitCode === null && child.signalCode === null && process.kill(-child.pid, "SIGKILL");
  return { child, out, exited, kill };
}

const until = async (ok, ms) => {
  for (const end = Date.now() + ms; !ok(); ) {
    if (Date.now() > end) return false;
    await new Promise((done) => setTimeout(done, 50));
  }
  return true;
};

test("AC-200-2: WHEN ci local is interrupted after creating its worktree THEN git worktree list doesn't show it afterwards", unixOnly, async () => {
  const { dir, temp, waiting, env } = cliRun(20000);
  // Its own process group, as a terminal's Ctrl-C reaches the CLI and the gh it is waiting on.
  const { child, out, exited, kill } = startCli(dir, env);
  try {
    assert.ok(await until(() => existsSync(waiting), 15000), `gh was never asked for the issue: ${out.text}`);
    assert.equal(worktrees(dir).length, 2, "the temp worktree exists while it waits");
    process.kill(-child.pid, "SIGINT");
    const end = await exited;
    assert.notEqual(end.code, 0, `${JSON.stringify(end)} ${out.text}`);
    assert.match(out.text, /Couldn.t open the issue on acme\/app \(stopped by SIGINT\)/);
    assert.equal(worktrees(dir).length, 1, `the temp worktree is gone: ${out.text}`);
    assert.deepEqual(readdirSync(temp), [], "and so is its folder");
  } finally {
    kill();
  }
});

test("#200 round 1: WHEN SIGTERM or SIGINT reaches only the CLI's own pid mid-run THEN it stops before the next step: no push, no pull request, no worktree, exit 128 + the signal", unixOnly, async () => {
  for (const signal of ["SIGTERM", "SIGINT"]) {
    const { dir, origin, temp, waiting, calls, env } = cliRun(1500);
    const { child, out, exited, kill } = startCli(dir, env);
    try {
      assert.ok(await until(() => existsSync(waiting), 15000), `${signal}: gh was never asked for the issue: ${out.text}`);
      // The CLI's pid alone, as a process manager that forwards a stop to its child does. gh keeps waiting, then answers.
      process.kill(child.pid, signal);
      const end = await exited;
      assert.equal(end.code, 128 + constants.signals[signal], `${signal}: ${JSON.stringify(end)} ${out.text}`);
      assert.match(out.text, new RegExp(`Stopped by ${signal}`), signal);
      assert.doesNotMatch(out.text, /✓ Pull request/, signal);
      assert.equal(git(origin, "branch", "--list", "fix/*"), "", `${signal}: nothing pushed to origin`);
      assert.doesNotMatch(readFileSync(calls, "utf8"), /pulls/, `${signal}: no pull request call`);
      assert.equal(worktrees(dir).length, 1, `${signal}: the temp worktree is gone: ${out.text}`);
      assert.deepEqual(readdirSync(temp), [], `${signal}: and so is its folder`);
    } finally {
      kill();
    }
  }
});
