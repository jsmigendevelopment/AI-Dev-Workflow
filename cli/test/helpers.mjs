// Test helpers: temp folders, captured output, small fake kits for update tests, and a safe PATH for every child.
import { after } from "node:test";
import { chmodSync, copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, existsSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { hash, toNative, writeFile } from "../src/files.mjs";
import { storedName } from "../src/kit.mjs";
import { findCommand } from "../src/system.mjs";

// Every folder tmp() makes is removed when the test file ends, so a run leaves nothing in TMPDIR (#142).
// Retries, because a child a test started may still be closing a file in it.
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

/** A new empty temp folder, removed when the test file ends. */
export function tmp(prefix = "onrails-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

// #191: a test never runs the person's real claude or codex, which can sit next to Node (an npm global install).
// A child's PATH holds only the test's fakes, a copy of node and the system folders. A copy, never a symlink:
// Linux resolves a symlink for process.execPath, which leads back to Node's own folder.
const PATH_KEY = /^path$/i;
const SYSTEM = process.platform === "win32" ? [join(process.env.SystemRoot ?? "C:\\Windows", "System32")] : ["/usr/bin", "/bin"];
const TOOLS = ["claude", "codex"].flatMap((name) => [name, `${name}.cmd`, `${name}.exe`]);
const fakes = new Set();
let ownNode;
// npm's own scripts, found on the shell's PATH before it is replaced. They go next to the copy of node, so their
// `#!/usr/bin/env node` starts that copy (#182's real runs start npm). Never a folder of them: claude can sit there too.
const NPM = process.platform === "win32" ? [] : ["npm", "npx"].map((name) => [name, findCommand(name)]).filter(([, file]) => file);

/** Writes an executable fake tool and records it as one of this test's fakes, the only claude or codex a child may see. */
export function fake(dir, name, body) {
  put(dir, name, body);
  chmodSync(join(dir, name), 0o755);
  fakes.add(realpathSync(join(dir, name)));
}

/** Puts a copy of node in dir (a new temp folder by default) and returns dir, so `#!/usr/bin/env node` fakes start. */
export function nodeOnly(dir = tmp("onrails-node-")) {
  const name = basename(process.execPath);
  if (!ownNode) {
    copyFileSync(process.execPath, (ownNode = join(tmp("onrails-node-"), name)));
    for (const [cmd, file] of NPM) symlinkSync(realpathSync(file), join(dirname(ownNode), cmd));
  }
  // A hard link to this file's own copy costs no disk. Another drive, or a system without hard links, gets a copy.
  try {
    linkSync(ownNode, join(dir, name));
  } catch {
    copyFileSync(ownNode, join(dir, name));
  }
  return dir;
}

/**
 * Throws if a folder on any PATH key of env (PATH, Path, path) holds a claude or codex that isn't one of this test's
 * fakes. Relative entries are read from cwd. Returns env, so a hand-built env is checked where it's made.
 */
export function checkPath(env, cwd = process.cwd()) {
  for (const [key, value] of Object.entries(env)) {
    if (!PATH_KEY.test(key) || typeof value !== "string") continue;
    for (const entry of value.split(delimiter).filter(Boolean)) {
      for (const name of TOOLS) {
        const file = resolve(cwd, entry, name);
        if (existsSync(file) && !fakes.has(realpathSync(file))) throw new Error(`${file} on the child's ${key} isn't one of this test's fakes`);
      }
    }
  }
  return env;
}

/** A safe PATH: the given folders of fakes, then this file's copy of node (with npm and npx), then the system folders. */
export function safePath(...dirs) {
  if (!ownNode) nodeOnly();
  return checkPath({ PATH: [...dirs, dirname(ownNode), ...SYSTEM].join(delimiter) }).PATH;
}

/** The env for a child: the shell's variables without any PATH key, a safePath() of `bins`, then `extra`, checked. */
export function safeEnv(extra = {}, { bins = [], cwd } = {}) {
  const shell = Object.fromEntries(Object.entries(process.env).filter(([name]) => !PATH_KEY.test(name)));
  return checkPath({ ...shell, PATH: safePath(...bins), ...extra }, cwd);
}

// This test file's own PATH is safe too, so code it runs in-process (doctor's probes) and a child that inherits the
// env never find the real tools.
for (const name of Object.keys(process.env).filter((key) => PATH_KEY.test(key))) delete process.env[name];
process.env.PATH = safePath();

export function logger() {
  const lines = [];
  const log = (...args) => lines.push(args.join(" "));
  log.text = () => lines.join("\n");
  return log;
}

export const read = (dir, path) => readFileSync(toNative(dir, path), "utf8");
export const exists = (dir, path) => existsSync(toNative(dir, path));
export const put = (dir, path, text) => writeFile(toNative(dir, path), text);

// A kit folder with the given core files ({ path: text }); returns its path.
export function makeKit(version, core, packs = {}) {
  const dir = tmp("onrails-kit-");
  const shas = {};
  for (const [path, text] of Object.entries(core)) {
    writeFile(toNative(join(dir, "files", "core"), storedName(path)), text);
    shas[path] = hash(Buffer.from(text));
  }
  writeFile(join(dir, "manifest.json"), JSON.stringify({ kitVersion: version, core: shas, packs }));
  return dir;
}

// A fake outside world for doctor: which commands exist, what probes answer, what ran.
// probes: { "cmd args": { ok, out, all } | null } overrides the default (ok if cmd exists).
export function fakeSystem({ platform = "linux", commands = [], probes = {}, isRoot = false, home = tmp("onrails-home-"), env = {} } = {}) {
  const ran = [];
  const has = (name) => commands.includes(name);
  const probe = (cmd, args) => {
    const key = [cmd, ...args].join(" ");
    if (key in probes) return probes[key];
    return has(cmd) ? { ok: true, out: `${cmd} 1.0.0`, all: `${cmd} 1.0.0` } : null;
  };
  const exec = (argv, { cwd } = {}) => (ran.push(cwd ? `${argv.join(" ")} @ ${cwd}` : argv.join(" ")), true);
  return { platform, isRoot, home, env, has, probe, exec, ran };
}

// Answers questions from a list, in order; "" once the list runs out. Records the questions.
export function fakeAsk(answers = []) {
  const queue = [...answers];
  const ask = async (question) => (ask.questions.push(question), queue.shift() ?? "");
  ask.questions = [];
  return ask;
}

// A fake `gh` for the coordinate scripts: `gh api <path>` answers from a map, and every call is logged.
const FAKE_GH = `#!/usr/bin/env node
const fs = require("fs");
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, argv.join(" ") + "\\n");
const api = JSON.parse(fs.readFileSync(process.env.FAKE_API, "utf8"));
const path = argv.filter((a) => a !== "api" && !a.startsWith("--")).at(-1);
if (!(path in api)) { process.stderr.write("HTTP 404: " + path + "\\n"); process.exit(1); }
if (api[path]?.ghError) { process.stderr.write(api[path].ghError + "\\n"); process.exit(1); }
process.stdout.write(JSON.stringify(argv.includes("--slurp") ? [api[path]] : api[path]));
`;
export const unixOnly = { skip: process.platform === "win32" ? "the fake gh is a shebang script" : false };

// Puts the fake gh in dir/bin. `api` maps an API path to its answer; `{ ghError: "<stderr>" }` makes gh fail with
// that text, the way a refused or broken call does. The env to spawn with drops the shell's
// REPO and HEAD_SHA, so a test never depends on them; `env` adds variables. `calls()` is the log so far.
export function fakeGh(dir, api, env = {}) {
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "bin", "gh"), FAKE_GH);
  chmodSync(join(dir, "bin", "gh"), 0o755);
  writeFileSync(join(dir, "api.json"), JSON.stringify(api));
  const log = join(dir, "calls.log");
  return {
    env: safeEnv({ REPO: undefined, HEAD_SHA: undefined, FAKE_API: join(dir, "api.json"), FAKE_LOG: log, ...env }, { bins: [join(dir, "bin")] }),
    calls: () => (existsSync(log) ? readFileSync(log, "utf8") : ""),
  };
}
