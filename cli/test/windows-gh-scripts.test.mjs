// #274: agent-files.mjs and research-library.mjs start gh through command-for.mjs, by the full path on PATH, never a
// gh.exe in the current folder; and command-for's roots() compares the home folder case-blind on win32. A fake win32
// and a recorded execFileSync, as in windows-gh.test.mjs: nothing runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { put, safeEnv, tmp } from "./helpers.mjs";

const at = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const AGENT_FILES = at(".agents/skills/coordinate/scripts/agent-files.mjs");
const LIBRARY = at(".agents/skills/research/scripts/research-library.mjs");
const COMMAND_FOR = at(".agents/skills/secrets/scripts/command-for.mjs");

// The process says win32 and execFileSync records what would start, answering "true" to gh.
const PRELOAD = `import cp from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
Object.defineProperty(process, "platform", { value: "win32" });
cp.execFileSync = (file, args, opts = {}) => {
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ file, args, noCurrentFolder: opts.env?.NoDefaultCurrentDirectoryInExePath ?? null }) + "\\n");
  return "true\\n";
};
syncBuiltinESMExports();
`;

/** Runs node with args in dir on a fake win32 whose PATH entries are path. Returns its output and what it started. */
function onWindows(args, dir, path, env = {}) {
  const base = tmp("onrails-win-gh2-");
  put(base, "preload.mjs", PRELOAD);
  const log = join(base, "starts.jsonl");
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(join(base, "preload.mjs")).href, ...args], {
    cwd: dir, encoding: "utf8", input: "", env: safeEnv({ FAKE_LOG: log, PATH: path.join(";"), PATHEXT: ".com;.exe;.bat;.cmd", ...env }),
  });
  const starts = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
  return { ...r, starts };
}

/** A repo with its own gh.exe in its top folder, and an installed gh.exe outside it. */
function ghRepo() {
  const dir = tmp("onrails-repo-");
  mkdirSync(join(dir, ".git"));
  put(dir, "gh.exe", "the repo's own\n");
  const installed = tmp("onrails-gh-");
  put(installed, "gh.exe", "installed\n");
  return { dir, gh: join(installed, "gh.exe"), path: [".", dir, installed] };
}

test("AC-1: WHEN agent-files.mjs runs on a fake win32 with a gh.exe in the current folder and another on PATH outside the repo THEN only the outside one starts, by full path", () => {
  const { dir, gh, path } = ghRepo();
  const r = onWindows([AGENT_FILES, "--pr", "7"], dir, path, { REPO: "acme/app", HEAD_SHA: "abc123" });
  assert.ok(r.starts.length > 0, r.stdout + r.stderr);
  for (const s of r.starts) assert.deepEqual([s.file, s.args[0], s.noCurrentFolder], [gh, "api", "1"], s.args.join(" "));
});

test("AC-2: WHEN research-library.mjs runs on a fake win32 with a gh.exe in the current folder and another on PATH outside the repo THEN only the outside one starts, by full path", () => {
  const { dir, gh, path } = ghRepo();
  const r = onWindows([LIBRARY, "private", "acme/library"], dir, path);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.starts, [{ file: gh, args: ["api", "repos/acme/library", "--jq", ".private"], noCurrentFolder: "1" }]);
});

test("AC-3: WHEN command-for.mjs runs on a fake win32 from a non-repo folder under home, with a git repo at home whose path differs from home only in case THEN a tool under home is not refused as inside the repo", () => {
  const parent = tmp("onrails-home-");
  const home = join(parent, "Home");
  mkdirSync(join(home, ".git"), { recursive: true });
  put(home, "bin/gh.exe", "installed\n");
  put(home, "work/notes.txt", "not a repo\n");
  const driver = join(parent, "driver.mjs");
  put(parent, "driver.mjs", `import { commandFor } from ${JSON.stringify(pathToFileURL(COMMAND_FOR).href)};\nconsole.log(JSON.stringify(commandFor("gh", ["--version"])));\n`);
  const r = onWindows([driver], join(home, "work"), [join(home, "bin")], { HOME: join(parent, "HOME"), USERPROFILE: join(parent, "HOME") });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).file, join(home, "bin", "gh.exe"), r.stdout);
});
