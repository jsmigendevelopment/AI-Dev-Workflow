// The fake session and the sample repos the preflight tests share. The probes run against these,
// so no test needs a network. The real-run helpers at the end run the real script in throwaway repos (#169).
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempBases } from "../src/preflight-layout.mjs";
import { aclPaths, loadWinAcls } from "../src/preflight-owner.mjs";
import { markRead } from "../src/preflight-sys.mjs";
import { findCommand } from "../src/system.mjs";
import { checkPath, put, safeEnv, tmp } from "./helpers.mjs";

export const NOW = Date.parse("2026-11-25T22:10:00Z");

// Windows ACLs (#246), as preflight's one PowerShell batch prints them. WIN_OWN: a profile folder, this user's with SYSTEM
// and Administrators, and Users who only read. WIN_DRIVE: C:\ as Windows 10 and 11 ship it, where every signed-in account
// (Authenticated Users) may make folders, and may modify what is made inside (the inherit-only rule, in generic form).
export const WIN_ME = "S-1-5-21-1-2-3-1001";
export const WIN_TI = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
export const WIN_OWN = [`owner ${WIN_ME}`, "Allow S-1-5-18 2032127", "Allow S-1-5-32-544 2032127", `Allow ${WIN_ME} 2032127`, "Allow S-1-5-32-545 1179817"];
const WIN_DRIVE = [`owner ${WIN_TI}`, "Allow S-1-5-18 2032127", "Allow S-1-5-32-544 2032127", "Allow S-1-5-11 4", "Allow S-1-5-11 -536805376 io",
  "Allow S-1-5-32-545 1179817"];

/** A fake of that batch: WIN_OWN for every path unless acls names it, and the root as C:\. Counts its starts. */
export function fakePowerShell(acls = {}) {
  const fake = (paths) => {
    fake.starts++;
    return [`user ${WIN_ME}`, ...paths.flatMap((p, i) => [`path ${i}`, ...(acls[p] ?? (p === "/" ? WIN_DRIVE : WIN_OWN))])].join("\r\n");
  };
  fake.starts = 0;
  return fake;
}

/** For a check run as "win32": every folder it asks about for dir is only this user's, as main() reads them first. */
export const trustWin = (dir, bases = tempBases("win32")) => loadWinAcls(aclPaths(dir, {}, bases), fakePowerShell());

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

/** A new temp folder: tmp() from helpers.mjs, which removes it when the test file ends (#180). */
export const temp = tmp;

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
export const status = (report, id) => report.results.find((r) => r.id === id).status;

const SCRIPT = fileURLToPath(new URL("../src/preflight.mjs", import.meta.url));

/** A PATH folder that holds only the named real commands, so nothing else preflight runs is found. */
export function pathWith(...cmds) {
  const bin = temp("onrails-read-bin-");
  for (const cmd of cmds) symlinkSync(findCommand(cmd), join(bin, cmd));
  return bin;
}

/**
 * Runs the real script in dir with env, or with only this PATH, from dir as the current folder, as an agent runs it
 * (#182: a relative PATH entry is then the repo). Returns the parsed report with --json, else the run.
 */
export function runScript(dir, env, ...flags) {
  const vars = { HOME: temp("onrails-read-home-"), ...(typeof env === "string" ? { PATH: env } : env) };
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...flags], { cwd: dir, encoding: "utf8", env: checkPath(vars, dir), timeout: 60000 });
  return flags.includes("--json") ? JSON.parse(r.stdout) : r;
}

export const sh = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", env: safeEnv() });

/** A git repo with one commit, then the extra lines in .git/config, and the files given. */
export function gitRepo(config, files = {}) {
  const dir = project({ "package.json": "{}", ...files });
  sh(dir, "init", "--quiet");
  sh(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "--allow-empty", "-m", "x");
  writeFileSync(join(dir, ".git", "config"), `${readFileSync(join(dir, ".git", "config"), "utf8")}${config}`);
  return dir;
}

// A Playwright package that leaves a file named "loaded" in the repo when it is loaded. Its launch answers like a real one.
export const PLAYWRIGHT = {
  "package.json": JSON.stringify({ devDependencies: { playwright: "1.60.0" } }),
  "node_modules/playwright/package.json": JSON.stringify({ name: "playwright", main: "index.js" }),
  "node_modules/playwright/index.js": "require('fs').writeFileSync(require('path').join(__dirname, '..', '..', 'loaded'), 'x');\n"
    + "module.exports = { chromium: { launch: async () => ({ close: async () => {} }) } };\n",
};

/** Fakes that each write the PATH they were given to a file named after them in mark, then fail (#182). */
export function fakes(dir, names, mark) {
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    put(dir, name, `#!/bin/sh\necho "$PATH" > '${join(mark, name)}'\nexit 1\n`);
    chmodSync(join(dir, name), 0o755);
  }
}
/** The names of the fakes that ran. */
export const ran = (mark) => readdirSync(mark).sort();
