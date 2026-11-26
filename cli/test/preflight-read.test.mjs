// #169: until the person's own session has marked a repo read, no preflight probe runs code the repo chose.
// The real script runs in throwaway repos, with fakes that leave a file behind when they run.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, isAbsolute, join, relative } from "node:path";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { main, probe, render, satisfies } from "../src/preflight.mjs";
import { commandFor, isRead, markRead, realSys, spawnEnv } from "../src/preflight-sys.mjs";
import { logger, put } from "./helpers.mjs";
import { fakeSys, HEALTHY, project, readProject, status, temp } from "./preflight-fakes.mjs";

const SCRIPT = fileURLToPath(new URL("../src/preflight.mjs", import.meta.url));
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const posixOnly = { skip: process.platform === "win32" ? "the fakes are POSIX shell scripts" : false };
const row = (report, id) => report.results.find((r) => r.id === id);
const PNPM = JSON.stringify({ packageManager: "pnpm@10.28.0" });

/** The first file on this session's PATH with that name. */
const which = (cmd) => (process.env.PATH ?? "").split(delimiter).map((dir) => join(dir, cmd)).find((f) => existsSync(f));

/** A PATH folder that holds only the named real commands, so nothing else preflight runs is found. */
function pathWith(...cmds) {
  const bin = temp("onrails-read-bin-");
  for (const cmd of cmds) symlinkSync(which(cmd), join(bin, cmd));
  return bin;
}

/** Runs the real script in dir. Returns the parsed report. */
function runScript(dir, bin, ...flags) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...flags], { encoding: "utf8", env: { PATH: bin, HOME: temp("onrails-read-home-") }, timeout: 60000 });
  return flags.includes("--json") ? JSON.parse(r.stdout) : r;
}

const sh = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });

test("AC-169-1: WHEN a repo ships files that would make the Playwright launch check load its own code THEN preflight, before the repo is read, loads nothing from the repo", posixOnly, () => {
  const dir = project({
    "package.json": JSON.stringify({ devDependencies: { playwright: "1.60.0" } }),
    "node_modules/playwright/package.json": JSON.stringify({ name: "playwright", main: "index.js" }),
    // Loading it leaves a file behind, and its launch answers like a real one.
    "node_modules/playwright/index.js": "require('fs').writeFileSync(require('path').join(__dirname, '..', '..', 'loaded'), 'x');\n"
      + "module.exports = { chromium: { launch: async () => ({ close: async () => {} }) } };\n",
  });
  mkdirSync(join(dir, ".git"));
  const bin = pathWith();
  const before = runScript(dir, bin, "--json");
  assert.equal(existsSync(join(dir, "loaded")), false, "the repo's own file was loaded before the read");
  assert.equal(status(before, "browser"), "limited");
  assert.match(row(before, "browser").detail, /after the repo is read/);
  // The control: once marked read, the launch check runs, so this test can fail.
  assert.equal(runScript(dir, bin, "--mark-read").status, 0);
  const afterRead = runScript(dir, bin, "--json");
  assert.equal(existsSync(join(dir, "loaded")), true, "marked read: the launch check runs as before");
  assert.equal(status(afterRead, "browser"), "ok");
});

/** A git repo with one commit, then the extra lines in .git/config, and the files given. */
function gitRepo(config, files = {}) {
  const dir = project({ "package.json": "{}", ...files });
  sh(dir, "init", "--quiet");
  sh(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "--allow-empty", "-m", "x");
  writeFileSync(join(dir, ".git", "config"), `${readFileSync(join(dir, ".git", "config"), "utf8")}${config}`);
  return dir;
}

test("AC-169-2: WHEN .git/config in a folder not made by git clone sets options that run commands THEN the GitHub probe runs none of them", posixOnly, () => {
  const other = temp("onrails-read-other-");
  sh(other, "init", "--quiet", "--bare");
  const bin = pathWith("git");
  const cases = {
    "a local remote's upload-pack": (m) => `[remote "origin"]\n\turl = ${other}\n\tuploadpack = "echo x > ${m}; git-upload-pack"\n`,
    "an ssh command": (m) => `[core]\n\tsshCommand = "echo x > ${m}; false"\n[remote "origin"]\n\turl = ssh://git@127.0.0.1:9/x.git\n`,
  };
  for (const [name, config] of Object.entries(cases)) {
    const mark = join(temp("onrails-read-mark-"), "ran");
    const dir = gitRepo(config(mark));
    const before = runScript(dir, bin, "--json");
    assert.equal(existsSync(mark), false, `${name}: ran before the read`);
    assert.equal(status(before, "github"), "limited", name);
    // The control: once marked read, the probe runs in the repo as before, so this test can fail.
    markRead(dir);
    runScript(dir, bin, "--json");
    assert.equal(existsSync(mark), true, `${name}: marked read, the probe uses the repo's settings as before`);
  }
});

test("AC-169-2: WHEN the repo ships a hook or names a hooks folder THEN the .git write probe runs no hook before the read", posixOnly, () => {
  const bin = pathWith("git");
  for (const where of [".git/hooks", "own-hooks"]) {
    const mark = join(temp("onrails-read-mark-"), "ran");
    const dir = gitRepo(where === "own-hooks" ? "[core]\n\thooksPath = own-hooks\n" : "");
    put(dir, `${where}/reference-transaction`, `#!/bin/sh\necho x > '${mark}'\n`);
    chmodSync(join(dir, where, "reference-transaction"), 0o755);
    const before = runScript(dir, bin, "--json");
    assert.equal(status(before, "git"), "ok", where);
    assert.equal(existsSync(mark), false, `${where}: a hook ran before the read`);
    markRead(dir);
    runScript(dir, bin, "--json");
    assert.equal(existsSync(mark), true, `${where}: marked read, the temp branch runs the repo's hooks as git does`);
  }
});

test("AC-169-2: before the read, the GitHub probe asks the remote's plain URL from outside the repo, and the git probes turn hooks off", async () => {
  const dir = project({ "package.json": "{}" });
  const sys = fakeSys({ answers: HEALTHY });
  const report = await probe(dir, sys);
  assert.equal(status(report, "github"), "ok");
  const ls = sys.runs.find((r) => r.line.startsWith("git ls-remote"));
  assert.equal(ls.line, "git ls-remote --heads https://github.com/acme/app.git");
  assert.ok(!ls.cwd.startsWith(dir), "ls-remote ran inside the repo");
  assert.ok(!sys.runs.find((r) => r.line.startsWith("gh ")).cwd.startsWith(dir), "gh ran inside the repo");
  for (const r of sys.runs.filter((x) => x.cwd === dir && x.line.startsWith("git "))) assert.match(r.config?.[0] ?? "", /^core\.hooksPath=/, r.line);
  // A URL that isn't plain https or ssh isn't asked at all.
  for (const url of ["/some/path", "ext::sh -c x", "file:///x", "--upload-pack=x", "ssh://-oProxyCommand=x/y", "https://x:secret@github.com/a/b.git"]) {
    const odd = fakeSys({ answers: { ...HEALTHY, "git remote get-url origin": { ok: true, out: url } } });
    const r = await probe(dir, odd);
    assert.ok(!odd.calls.some((c) => c.startsWith("git ls-remote")), url);
    assert.match(row(r, "github").detail, /checked after the repo is read/, url);
  }
  // Marked read: the repo's own remote, from the repo, as before.
  const marked = fakeSys({ answers: HEALTHY });
  await probe(readProject({ "package.json": "{}" }), marked);
  assert.ok(marked.calls.includes("git ls-remote --heads origin"));
});

test("AC-169-3: WHEN preflight spawns on Windows THEN the current folder is never searched for executables", async () => {
  assert.equal(spawnEnv("win32", { PATH: "x" }).NoDefaultCurrentDirectoryInExePath, "1");
  assert.equal(spawnEnv("win32", {}).COREPACK_ENV_FILE, "0");
  const bin = temp("onrails-read-winbin-");
  for (const name of ["pnpm.cmd", "git.exe"]) put(bin, name, "");
  const env = { PATH: bin, PATHEXT: ".EXE;.CMD", ComSpec: "C:\\Windows\\system32\\cmd.exe" };
  // Every command the real session starts gets the switch: a shim through cmd.exe, and a plain .exe.
  const seen = [];
  const start = (file, args, opts) => {
    seen.push({ file, env: opts.env });
    const child = Object.assign(new EventEmitter(), { pid: 1, stdout: new PassThrough(), stderr: new PassThrough() });
    setImmediate(() => { child.stdout.end("10.28.0"); child.emit("exit", 0); child.emit("close", 0); });
    return child;
  };
  const sys = realSys({ platform: "win32", env, start });
  assert.deepEqual(await sys.run("pnpm", ["--version"]), { ok: true, out: "10.28.0" });
  await sys.run("git", ["status"]);
  assert.deepEqual(seen.map((s) => s.file), [env.ComSpec, join(bin, "git.exe")]);
  for (const s of seen) assert.equal(s.env.NoDefaultCurrentDirectoryInExePath, "1", s.file);
  // No ComSpec: cmd.exe by its full path, never a bare name looked up in the current folder.
  const bare = commandFor("pnpm", ["--version"], { platform: "win32", env: { PATH: bin, PATHEXT: ".CMD" } });
  assert.ok(/^[A-Z]:\\/.test(bare.file) && bare.file.endsWith("cmd.exe"), bare.file);
  // A relative PATH entry is the current folder (or under it): never searched.
  const near = relative(process.cwd(), bin);
  assert.ok(!isAbsolute(near));
  assert.equal(commandFor("pnpm", ["--version"], { platform: "win32", env: { PATH: `.;${near}`, PATHEXT: ".CMD" } }), null);
  assert.equal(realSys({ platform: "linux", env: { PATH: near } }).has("pnpm.cmd"), false);
});

/** True while pid is a live process. A zombie waiting for its parent counts as gone. */
function alive(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return error.code === "EPERM";
  }
  return !(existsSync(`/proc/${pid}/stat`) && / Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8")));
}
const left = [];
after(() => { for (const pid of left) if (alive(pid)) process.kill(pid, "SIGKILL"); });
async function gone(pids) {
  for (let i = 0; i < 40 && pids.some(alive); i++) await new Promise((r) => setTimeout(r, 50));
  return pids.filter(alive);
}

test("AC-169-4: WHEN a package-manager probe starts a self-install THEN preflight stops it and leaves no child process running", posixOnly, async () => {
  const dir = temp("onrails-read-slow-");
  const pids = join(dir, "pids");
  // A probe that starts a long install in the background and never answers.
  put(dir, "slow", `#!/bin/sh\nsleep 30 >/dev/null 2>&1 &\necho $! > '${pids}'\nsleep 30\n`);
  // A probe that answers at once but leaves its install running.
  put(dir, "quick", `#!/bin/sh\nsleep 30 >/dev/null 2>&1 &\necho $! > '${pids}'\necho 10.28.0\n`);
  for (const name of ["slow", "quick"]) chmodSync(join(dir, name), 0o755);
  const sys = realSys();
  const started = Date.now();
  const slow = await sys.run(join(dir, "slow"), ["--version"], { timeout: 500 });
  assert.ok(Date.now() - started < 5000, "the run ended near its timeout");
  assert.equal(slow.ok, false);
  assert.match(slow.out, /ETIMEDOUT/);
  const first = Number(readFileSync(pids, "utf8"));
  left.push(first);
  assert.deepEqual(await gone([first]), [], "the install the slow probe started is still running");
  const quick = await sys.run(join(dir, "quick"), ["--version"], { timeout: 10000 });
  assert.deepEqual(quick, { ok: true, out: "10.28.0" });
  const second = Number(readFileSync(pids, "utf8"));
  left.push(second);
  assert.deepEqual(await gone([second]), [], "the install the quick probe left behind is still running");
});

test("AC-169-5: WHEN a repo ships docs/state.md but the person's own session hasn't read it THEN preflight still treats it as not read", async () => {
  const state = { "package.json": PNPM, "docs/state.md": "# State\n\n- **Environment:** ok · checked x · claude · fp 0\n" };
  const shipped = project(state);
  const sys = fakeSys({ answers: HEALTHY });
  const report = await probe(shipped, sys);
  assert.equal(report.read, false);
  assert.ok(!sys.calls.includes("pnpm --version"), "a version probe ran");
  assert.equal(status(report, "versions"), "limited");
  // Said once, under the table.
  assert.equal(render(report).match(/has a docs\/state\.md, but no session on this machine has marked it read/g)?.length, 1);
  // A marker that came with the repo doesn't count: plain text, or one copied from a repo marked on this machine.
  const marked = readProject();
  for (const text of ["onrails read\n", readFileSync(join(marked, ".git", "onrails-read"), "utf8")]) {
    const copied = project(state);
    put(copied, ".git/onrails-read", text);
    assert.equal(isRead(copied), false, JSON.stringify(text));
  }
  // Nor does a .git file that points at a repo marked on this machine.
  assert.equal(isRead(project({ ...state, ".git": `gitdir: ${join(marked, ".git")}\n` })), false);
  // /join or /back marks it: then the probes run, and the note is gone.
  const log = logger();
  mkdirSync(join(shipped, ".git"));
  assert.equal(await main([shipped, "--mark-read"], { sys: fakeSys(), log }), 0);
  assert.match(log.text(), /Marked this repo read/);
  const again = fakeSys({ answers: HEALTHY });
  const now = await probe(shipped, again);
  assert.equal(now.read, true);
  assert.ok(again.calls.includes("pnpm --version"));
  assert.doesNotMatch(render(now), /marked it read/);
  assert.equal(await main([project(), "--mark-read"], { sys: fakeSys(), log: logger() }), 1, "no .git: nothing to mark");
});

test("AC-169-5: a linked worktree of a marked repo counts as read; its marker lives in the shared .git folder", posixOnly, () => {
  const top = gitRepo("");
  markRead(top);
  const tree = join(temp("onrails-read-tree-"), "wt");
  sh(top, "worktree", "add", "--quiet", "--detach", tree);
  assert.equal(isRead(tree), true);
  assert.equal(statSync(join(tree, ".git")).isFile(), true);
  assert.equal(existsSync(join(top, ".git", "onrails-read")), true);
});

test("AC-169-5: /join and /back write the read marker, and the reference says what it is", () => {
  for (const skill of ["join", "back"]) assert.match(read(`.agents/skills/${skill}/SKILL.md`), /preflight\.mjs --mark-read/, skill);
  const ref = read(".agents/skills/ask/references/preflight.md");
  assert.match(ref, /--mark-read/);
  assert.match(ref, /inside `\.git\/`/);
});

test("#169: before the read, the registry probe runs npm from outside the repo, with only a plain registry from its .npmrc", async () => {
  const dir = project({ "package.json": JSON.stringify({ packageManager: "npm@10.9.0" }), ".npmrc": "registry=https://npm.example.com/\n" });
  const sys = fakeSys({ answers: HEALTHY });
  await probe(dir, sys);
  const npm = sys.runs.filter((r) => r.line.startsWith("npm "));
  assert.equal(npm.length, 2);
  for (const r of npm) {
    assert.ok(!r.cwd.startsWith(dir), `${r.line} ran inside the repo`);
    assert.ok(r.line.endsWith(" --registry=https://npm.example.com/"), r.line);
  }
  const odd = fakeSys({ answers: HEALTHY });
  await probe(project({ ".npmrc": "registry=https://x.example.com/${TOKEN}\n" }), odd);
  assert.ok(odd.calls.every((c) => !c.includes("--registry")), "an odd registry is never passed");
  const marked = fakeSys({ answers: HEALTHY });
  const inside = readProject({ ".npmrc": "registry=https://npm.example.com/\n" });
  await probe(inside, marked);
  for (const r of marked.runs.filter((x) => x.line.startsWith("npm "))) assert.equal(r.cwd, inside, "marked read: npm runs in the repo as before");
});

test("#169: an x-range with a prerelease reads as a version, so it can't make Node 18 blocked", () => {
  assert.equal(satisfies("18.0.0", ">=24 || 18.x.x-rc"), true);
  assert.equal(satisfies("18.0.0", ">=24 || x.x.x-rc.1"), true);
  // Fewer than three parts before a prerelease is still not a version.
  assert.equal(satisfies("18.0.0", ">=24 || 18.x-rc"), false);
});

test("#169: the system layer ships next to preflight in the ask skill and the CLI", () => {
  for (const at of [".agents/skills/ask/scripts", "cli/src"]) assert.equal(read(`${at}/preflight-sys.mjs`), read("scripts/preflight-sys.mjs"), at);
});
