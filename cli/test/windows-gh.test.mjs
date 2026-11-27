// #238: push-secrets.mjs and setup-github.mjs start gh the way #237 starts npx (command-for.mjs): by the full path on
// PATH, never a copy the repo ships, and a gh.cmd only through cmd.exe with no value in its arguments. The scope
// addition from #239's review: the PATH search matches the CLI's toolPath, and cmd.exe comes from a full-path ComSpec
// and gets /v:off, in command-for.mjs and in launch. A fake win32 and a recorded execFileSync: nothing runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "../src/system.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";
import { envFiles, LIVE_VALUE, PUSH, repo, SETUP, TEST_VALUE } from "./secrets-fakes.mjs";

const ComSpec = "C:\\Windows\\System32\\cmd.exe";
const PATHEXT = ".com;.exe;.bat;.cmd";

// Loaded with --import before the script: the process says win32, its PATH is the fake Windows one, and execFileSync
// records what would start (file, arguments, stdin) and answers from FAKE_ANSWERS ({ "tool args...": stdout }).
const PRELOAD = `import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
Object.defineProperty(process, "platform", { value: "win32" });
process.env.PATH = process.env.FAKE_WIN_PATH;
const answers = Object.entries(JSON.parse(process.env.FAKE_ANSWERS || "{}"));
cp.execFileSync = (file, args, opts = {}) => {
  const started = { file, args, input: opts.input ?? null, verbatim: opts.windowsVerbatimArguments ?? false,
    noCurrentFolder: opts.env?.NoDefaultCurrentDirectoryInExePath ?? null };
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(started) + "\\n");
  const line = [path.basename(file).replace(/\\.(exe|cmd)$/i, ""), ...args].join(" ");
  return answers.find(([start]) => line.startsWith(start))?.[1] ?? "";
};
syncBuiltinESMExports();
`;

// What setup-github reads before its steps, as the fake gh and git answer it.
const GITHUB = {
  "git remote get-url origin": "https://github.com/acme/app.git\n",
  "gh api repos/acme/app/commits/HEAD": "abc123\n",
  "gh api repos/acme/app/rulesets": "[]",
  "gh api repos/acme/app --jq": "private\n",
  "gh api user": JSON.stringify({ login: "me", id: 1 }),
};

/** Runs `script` in `dir` on a fake win32 whose PATH entries are `path`. Returns its output and what it started. */
function onWindows(script, dir, path, args, env = {}) {
  const base = tmp("onrails-win-gh-");
  put(base, "preload.mjs", PRELOAD);
  const log = join(base, "starts.jsonl");
  const fake = { FAKE_LOG: log, FAKE_WIN_PATH: path.join(";"), FAKE_ANSWERS: JSON.stringify(GITHUB), PATHEXT, ComSpec, ...env };
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(join(base, "preload.mjs")).href, script, ...args], {
    cwd: dir, encoding: "utf8", input: "", env: safeEnv(fake),
  });
  const starts = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
  return { ...r, starts };
}

/** A repo on ci = "actions" that ships its own gh.exe, in its top folder and in a tools folder; and gh.exe outside it. */
function ghRepo() {
  const dir = repo("actions");
  for (const path of ["gh.exe", "tools/gh.exe"]) put(dir, path, "the repo's own\n");
  const installed = tmp("onrails-gh-");
  put(installed, "gh.exe", "installed\n");
  return { dir, gh: join(installed, "gh.exe"), path: [".", join(dir, "tools"), installed] };
}

const noValue = (starts) => {
  for (const value of [TEST_VALUE, LIVE_VALUE]) {
    assert.ok(!starts.some((s) => [s.file, ...s.args].join(" ").includes(value)), "a value in a command's arguments");
  }
};

test("AC-238-1: WHEN push-secrets runs on a fake win32 with a gh.exe in the current folder and another on PATH outside the repo THEN only the outside one starts, by full path, and a secret goes in only through stdin", () => {
  const { dir, gh, path } = ghRepo();
  const r = onWindows(PUSH, dir, path, []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const start = (args, input = null) => ({ file: gh, args, input, verbatim: false, noCurrentFolder: "1" });
  assert.deepEqual(r.starts, [
    start(["variable", "get", "SECRETS_MODE"]),
    start(["secret", "set", "API_TOKEN", "--env", "test"], TEST_VALUE),
    start(["secret", "set", "API_TOKEN", "--env", "production"], LIVE_VALUE),
    start(["variable", "set", "SITE_URL", "--env", "production", "--body", "https://example.com"]),
  ]);
  noValue(r.starts);
  assert.doesNotMatch(r.stdout + r.stderr, /DO_NOT_PRINT/);
});

test("AC-238-1: WHEN setup-github runs on a fake win32 with a gh.exe in the current folder and another on PATH outside the repo THEN only the outside one starts, by full path", () => {
  const { dir, gh, path } = ghRepo();
  const r = onWindows(SETUP, dir, path, ["--plan", "free"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const ghStarts = r.starts.filter((s) => s.file !== "git");
  assert.ok(ghStarts.length > 5, JSON.stringify(r.starts));
  for (const s of ghStarts) assert.deepEqual([s.file, s.verbatim, s.noCurrentFolder], [gh, false, "1"], s.args.join(" "));
  assert.ok(ghStarts.some((s) => s.args.join(" ") === "variable set SECRETS_MODE --body repository --repo acme/app"));
  assert.match(r.stdout, /done +labels/);
});

test("AC-238-1: WHEN gh is found only in a relative PATH entry or inside the repo THEN push-secrets and setup-github start no gh and say why", () => {
  const { dir } = ghRepo();
  const path = [".", join(dir, "tools")];
  const push = onWindows(PUSH, dir, path, []);
  assert.deepEqual(push.starts, []);
  assert.notEqual(push.status, 0);
  assert.match(push.stdout, /test: FAILED API_TOKEN as a GitHub secret \(env test\): gh found only in a relative PATH entry, not run/);
  assert.match(push.stdout, /Keep \.env\.test\.local and \.env\.production\.local until each one is stored\./);
  const setup = onWindows(SETUP, dir, path, ["--plan", "free"]);
  assert.deepEqual(setup.starts.filter((s) => s.file !== "git"), []);
  assert.equal(setup.status, 1);
  assert.match(setup.stderr, /gh found only in a relative PATH entry, not run/);
  assert.match(onWindows(PUSH, dir, path.slice(1), []).stdout, /gh found only inside this repo, not run/);
});

test("#238: WHEN gh is a gh.cmd THEN push-secrets starts it through cmd.exe with /v:off, and a secret and a plain variable's value both go in only through stdin", () => {
  const dir = repo("actions");
  const npm = tmp("onrails-gh-cmd-");
  put(npm, "gh.cmd", "shim\n");
  const r = onWindows(PUSH, dir, [npm], []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const start = (words, input = null) => ({
    file: ComSpec, args: ["/d", "/v:off", "/s", "/c", `""${join(npm, "gh.cmd")}" ${words}"`], input, verbatim: true, noCurrentFolder: "1",
  });
  assert.deepEqual(r.starts, [
    start("variable get SECRETS_MODE"),
    start("secret set API_TOKEN --env test", TEST_VALUE),
    start("secret set API_TOKEN --env production", LIVE_VALUE),
    start("variable set SITE_URL --env production", "https://example.com"),
  ]);
  noValue(r.starts);
  assert.ok(!r.starts.some((s) => s.args.join(" ").includes("example.com")), "a plain variable's value went to cmd.exe");
});

test("#238: WHEN the only npx outside the repo is in a node_modules/.bin, by its PATH entry or its real path THEN push-secrets doesn't start it", () => {
  const dir = repo();
  const outside = tmp("onrails-bin-");
  put(outside, "node_modules/.bin/npx.cmd", "a package's own\n");
  // A junction needs no symlink rights on a real Windows machine; elsewhere the type is ignored.
  symlinkSync(join(outside, "node_modules", ".bin"), join(outside, "tools"), "junction");
  for (const entry of [join(outside, "node_modules", ".bin"), join(outside, "tools")]) {
    const r = onWindows(PUSH, dir, [entry], ["--wrangler", "--env", "test"]);
    assert.deepEqual(r.starts, [], entry);
    assert.match(r.stdout, /test: FAILED API_TOKEN as a Cloudflare secret: npx found only in a node_modules\/\.bin, not run/);
  }
});

test("#238: WHEN the home folder is a git repo and the current folder under it isn't one THEN npx in ~/.local/bin starts, unless ~ is an onRails project", () => {
  const home = tmp("onrails-home-");
  mkdirSync(join(home, ".git"));
  put(home, ".local/bin/npx.cmd", "the person's own\n");
  const app = join(home, "newapp");
  put(app, "docs/stack.md", 'ci = "local"\n');
  envFiles(app);
  const run = () => onWindows(PUSH, app, [join(home, ".local", "bin")], ["--wrangler", "--env", "test"], { HOME: home });
  const mine = run();
  assert.equal(mine.status, 0, mine.stdout + mine.stderr);
  assert.deepEqual(mine.starts.map((s) => s.args.at(-1)), [`""${join(home, ".local", "bin", "npx.cmd")}" wrangler secret put API_TOKEN --env test"`]);
  writeFileSync(join(home, ".onrails.json"), "{}\n");
  const project = run();
  assert.deepEqual(project.starts, []);
  assert.match(project.stdout, /npx found only inside this repo, not run/);
});

test("#238: WHEN ComSpec isn't a full path THEN push-secrets and launch start cmd.exe from SystemRoot, and from C:\\Windows when that isn't one either", () => {
  const dir = repo();
  const npm = tmp("onrails-npm-");
  put(npm, "npx.cmd", "shim\n");
  const shim = "C:\\Program Files\\nodejs\\npm.cmd";
  for (const [env, cmdExe] of [
    [{ ComSpec: "cmd.exe", SystemRoot: "D:\\Win" }, "D:\\Win\\System32\\cmd.exe"],
    [{ ComSpec: ".\\cmd.exe", SystemRoot: "Win" }, "C:\\Windows\\System32\\cmd.exe"],
  ]) {
    const r = onWindows(PUSH, dir, [npm], ["--wrangler", "--env", "test"], env);
    assert.deepEqual(r.starts.map((s) => [s.file, ...s.args.slice(0, 2)]), [[cmdExe, "/d", "/v:off"]], JSON.stringify(env));
    const l = launch([shim, "install", "-g", "corepack"], { platform: "win32", env: { ...env, PATHEXT } });
    assert.deepEqual([l.file, l.args], [cmdExe, ["/d", "/v:off", "/s", "/c", `""${shim}" install -g corepack"`]]);
  }
});

test("#238: WHEN HOME is a folder inside a git repo that isn't an onRails project and the run is from a subfolder THEN the repo still counts, so its npx doesn't start", () => {
  const top = tmp("onrails-holds-home-");
  mkdirSync(join(top, ".git"));
  put(top, "tools/npx.cmd", "the repo's own\n");
  mkdirSync(join(top, "home"));
  const app = join(top, "app");
  put(app, "docs/stack.md", 'ci = "local"\n');
  envFiles(app);
  const r = onWindows(PUSH, app, [join(top, "tools")], ["--wrangler", "--env", "test"], { HOME: join(top, "home") });
  assert.deepEqual(r.starts, []);
  assert.match(r.stdout, /npx found only inside this repo, not run/);
});

test("#238: WHEN ComSpec or SystemRoot has no drive letter and isn't a UNC path THEN push-secrets and launch don't use it", () => {
  const dir = repo();
  const npm = tmp("onrails-npm-");
  put(npm, "npx.cmd", "shim\n");
  const shim = "C:\\Program Files\\nodejs\\npm.cmd";
  for (const [env, cmdExe] of [
    [{ ComSpec: "\\cmd.exe", SystemRoot: "D:\\Win" }, "D:\\Win\\System32\\cmd.exe"],
    [{ ComSpec: "\\Windows\\System32\\cmd.exe", SystemRoot: "\\Win" }, "C:\\Windows\\System32\\cmd.exe"],
    [{ ComSpec: "\\\\server\\share\\cmd.exe", SystemRoot: "\\Win" }, "\\\\server\\share\\cmd.exe"],
    [{ ComSpec: "E:/Tools/cmd.exe", SystemRoot: "\\Win" }, "E:/Tools/cmd.exe"],
  ]) {
    const r = onWindows(PUSH, dir, [npm], ["--wrangler", "--env", "test"], env);
    assert.deepEqual(r.starts.map((s) => s.file), [cmdExe], JSON.stringify(env));
    assert.equal(launch([shim, "install"], { platform: "win32", env: { ...env, PATHEXT } }).file, cmdExe, JSON.stringify(env));
  }
});
