// Test helpers: temp folders, captured output and small fake kits for update tests.
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash, toNative, writeFile } from "../src/files.mjs";
import { storedName } from "../src/kit.mjs";

export const tmp = (prefix = "adw-") => mkdtempSync(join(tmpdir(), prefix));

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
  const dir = tmp("adw-kit-");
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
export function fakeSystem({ platform = "linux", commands = [], probes = {}, isRoot = false, home = tmp("adw-home-"), env = {} } = {}) {
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
