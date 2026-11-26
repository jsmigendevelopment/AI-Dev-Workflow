// Test helpers: temp folders, captured output, small fake kits for update tests, and a safe PATH for every child.
// First, so this file's process has the safe PATH before anything else loads (#191, #197).
import { PATH_KEY, checkPath, fakes, ownNode, safePath } from "./safe-path-preload.mjs";
import { after, beforeEach } from "node:test";
import { chmodSync, copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { hash, toNative, writeFile } from "../src/files.mjs";
import { storedName } from "../src/kit.mjs";

export { checkPath, safePath };

// Every folder tmp() makes is removed when the test file ends, so a run leaves nothing in TMPDIR (#142).
// Retries, because a child a test started may still be closing a file in it.
const made = [];
const removeMade = () => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
};
// Registered when a test file first imports this file, so it runs before that file's own root after() hooks (#180).
after(removeMade);
// A file that throws while it loads ends with no after() hook and no exit event, so the throw's monitor removes what
// tmp() made by then. Once a test starts, a throw fails only the test it hits, so the folders stay (#180).
let loading = true;
beforeEach(() => {
  loading = false;
});
process.on("uncaughtExceptionMonitor", () => {
  if (loading) removeMade();
});

/** A new empty temp folder, removed when the test file ends. */
export function tmp(prefix = "onrails-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** Writes an executable fake tool and records it as one of this test's fakes, the only claude or codex a child may see. */
export function fake(dir, name, body) {
  put(dir, name, body);
  chmodSync(join(dir, name), 0o755);
  fakes.add(realpathSync(join(dir, name)));
}

/** Puts a copy of node in dir (a new temp folder by default) and returns dir, so `#!/usr/bin/env node` fakes start. */
export function nodeOnly(dir = tmp("onrails-node-")) {
  const name = basename(ownNode);
  // A hard link to the run's one copy costs no disk. Another drive, or a system without hard links, gets a copy.
  try {
    linkSync(ownNode, join(dir, name));
  } catch {
    copyFileSync(ownNode, join(dir, name));
  }
  return dir;
}

/** The env for a child: the shell's variables without any PATH key, a safePath() of `bins`, then `extra`, checked. */
export function safeEnv(extra = {}, { bins = [], cwd } = {}) {
  const shell = Object.fromEntries(Object.entries(process.env).filter(([name]) => !PATH_KEY.test(name)));
  return checkPath({ ...shell, PATH: safePath(...bins), ...extra }, cwd);
}

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
let answer = api[path];
if (Array.isArray(answer?.sequence)) {
  const seen = fs.readFileSync(process.env.FAKE_LOG, "utf8").split("\\n").filter((l) => l.split(" ").at(-1) === path).length;
  answer = answer.sequence[Math.min(seen, answer.sequence.length) - 1];
}
if (answer?.ghError) { process.stderr.write(answer.ghError + "\\n"); process.exit(1); }
if (typeof answer?.raw === "string") { process.stdout.write(answer.raw); process.exit(0); }
process.stdout.write(JSON.stringify(argv.includes("--slurp") ? [answer] : answer));
`;
export const unixOnly = { skip: process.platform === "win32" ? "the fake gh is a shebang script" : false };

// Puts the fake gh in dir/bin. `api` maps an API path to its answer; `{ ghError: "<stderr>" }` makes gh fail with
// that text, the way a refused or broken call does. `{ raw: "<text>" }` prints the text as is, like a raw file read. `{ sequence: [a, b] }` answers a on the first call to that
// path, b on the second, and the last one from then on. The env to spawn with drops the shell's
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
