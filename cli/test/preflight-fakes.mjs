// The fake session and the sample repos the preflight tests share. The probes run against these,
// so no test needs a network.
import { after } from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { markRead } from "../src/preflight-sys.mjs";
import { put, tmp } from "./helpers.mjs";

export const NOW = Date.parse("2026-11-25T22:10:00Z");

// A fake session. `answers` maps the start of a command line to { ok, out }; anything else
// answers ok with no output. `missing` commands aren't installed, and aren't on PATH. Every call is
// recorded: in `calls` as its command line, and in `runs` with its folder and options too.
export function fakeSys({ env = {}, answers = {}, missing = [], loopback = { ok: true, detail: "127.0.0.1:40001" }, node = "22.23.5", hostname = "box-1" } = {}) {
  const calls = [];
  const runs = [];
  return {
    env, node, hostname, platform: "linux", now: () => NOW, calls, runs,
    loopback: async () => loopback,
    has: (cmd) => !missing.includes(cmd),
    run(cmd, args = [], opts = {}) {
      const line = [cmd, ...args].join(" ");
      calls.push(line);
      runs.push({ line, ...opts });
      if (missing.includes(cmd)) return null;
      const key = Object.keys(answers).filter((k) => line.startsWith(k)).sort((a, b) => b.length - a.length)[0];
      return key ? { ok: answers[key].ok, out: answers[key].out ?? "" } : { ok: true, out: "" };
    },
  };
}

// A healthy repo: git works, the registry answers, GitHub answers, pnpm is there.
export const HEALTHY = {
  "git rev-parse --show-toplevel": { ok: true, out: "/repo" },
  "git rev-parse --verify HEAD": { ok: true, out: "abc" },
  "npm config get registry": { ok: true, out: "https://registry.npmjs.org/" },
  "npm view": { ok: true, out: "12.0.0" },
  "git remote get-url origin": { ok: true, out: "https://github.com/acme/app.git" },
  "git ls-remote": { ok: true, out: "abc\trefs/heads/main" },
  "gh api rate_limit": { ok: true, out: "{}" },
  "pnpm --version": { ok: true, out: "10.28.0" },
};
export const BLOCKED = {
  ...HEALTHY,
  "git branch": { ok: false, out: "fatal: cannot lock ref: Read-only file system" },
  "git config": { ok: false, out: "error: could not lock config file .git/config: Read-only file system" },
  "npm view": { ok: false, out: "npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/npm failed" },
};

// Every temp folder these tests make is removed when the file is done.
const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
export function temp(prefix) {
  const dir = tmp(prefix);
  made.push(dir);
  return dir;
}

export function project(files = {}) {
  const dir = temp("onrails-preflight-");
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  return dir;
}
// A project the person's own session has marked read (#169): a .git folder with the marker in it.
export function readProject(files = {}) {
  const dir = project(files);
  mkdirSync(join(dir, ".git"), { recursive: true });
  markRead(dir);
  return dir;
}
export const status =(report, id) => report.results.find((r) => r.id === id).status;
