// Test helpers: temp folders, captured output and small fake kits for update tests.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { hash, toNative, writeFile } from "../src/files.mjs";
import { storedName } from "../src/kit.mjs";

export const tmp = (prefix = "onrails-") => mkdtempSync(join(tmpdir(), prefix));

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
  const shell = Object.fromEntries(Object.entries(process.env).filter(([name]) => !["REPO", "HEAD_SHA"].includes(name)));
  return {
    env: { ...shell, PATH: `${join(dir, "bin")}${delimiter}${process.env.PATH}`, FAKE_API: join(dir, "api.json"), FAKE_LOG: log, ...env },
    calls: () => (existsSync(log) ? readFileSync(log, "utf8") : ""),
  };
}
