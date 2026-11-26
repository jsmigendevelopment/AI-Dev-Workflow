// #200: `ci local` against a real git repo with a bare origin in the temp folder. Only gh is faked, and the remote's
// name: git answers `remote get-url origin` with a github.com URL while fetch and push go to the bare origin, so
// nothing reaches GitHub. AC-1: a committed symlink never takes the delete or the write outside the worktree.
// AC-2: an interrupt still removes the worktree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ciLocal, realRun } from "../src/ci-local.mjs";
import { findCommand } from "../src/system.mjs";
import { fakeGh, logger, put, tmp, unixOnly } from "./helpers.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "cli.mjs");
const FULL = "# Stack\n\n## Automation level\n\n- **Level:** full\n";
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

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
  return { base, dir };
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

// gh, faked for a child process: it turns Actions off, names main, then hangs on the issue until the test interrupts it.
const HANGING_GH = `#!/usr/bin/env node
const fs = require("fs");
const line = process.argv.slice(2).join(" ");
if (line.includes("--method PUT")) process.exit(0);
if (line === "api repos/acme/app") { process.stdout.write(JSON.stringify({ default_branch: "main" })); process.exit(0); }
if (line.includes("repos/acme/app/issues")) { fs.writeFileSync(process.env.WAITING, "1"); setTimeout(() => process.exit(1), 20000); }
else process.exit(1);
`;
// git, with only the remote's name changed, as above.
const GIT_SHIM = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.join(" ") === "remote get-url origin") { process.stdout.write("https://github.com/acme/app.git\\n"); process.exit(0); }
const r = require("child_process").spawnSync(process.env.REAL_GIT, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
`;

const until = async (ok, ms) => {
  for (const end = Date.now() + ms; !ok(); ) {
    if (Date.now() > end) return false;
    await new Promise((done) => setTimeout(done, 50));
  }
  return true;
};

test("AC-200-2: WHEN ci local is interrupted after creating its worktree THEN git worktree list doesn't show it afterwards", unixOnly, async () => {
  const { base, dir } = realRepo({ files: { "docs/stack.md": FULL, ".github/workflows/ci.yml": "on: push\n" } });
  const temp = tmp("onrails-ci-temp-");
  const waiting = join(base, "waiting");
  const { env } = fakeGh(base, {}, { REAL_GIT: findCommand("git"), WAITING: waiting, TMPDIR: temp, HOME: tmp("onrails-home-") });
  for (const [name, script] of [["gh", HANGING_GH], ["git", GIT_SHIM]]) {
    writeFileSync(join(base, "bin", name), script);
    chmodSync(join(base, "bin", name), 0o755);
  }
  // Its own process group, as a terminal's Ctrl-C reaches the CLI and the gh it is waiting on.
  const child = spawn(process.execPath, [CLI, "ci", "local", dir, "--yes"], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (d) => (output += d));
  const exited = new Promise((done) => child.on("exit", (code, signal) => done({ code, signal })));
  try {
    assert.ok(await until(() => existsSync(waiting), 15000), `gh was never asked for the issue: ${output}`);
    assert.equal(worktrees(dir).length, 2, "the temp worktree exists while it waits");
    process.kill(-child.pid, "SIGINT");
    const end = await exited;
    assert.notEqual(end.code, 0, `${JSON.stringify(end)} ${output}`);
    assert.match(output, /Couldn.t open the issue on acme\/app \(stopped by SIGINT\)/);
    assert.equal(worktrees(dir).length, 1, `the temp worktree is gone: ${output}`);
    assert.deepEqual(readdirSync(temp), [], "and so is its folder");
  } finally {
    if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, "SIGKILL");
  }
});
