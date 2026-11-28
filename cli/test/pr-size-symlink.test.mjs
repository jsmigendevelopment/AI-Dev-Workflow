// #439: pr-size.mjs's main-module guard compares real paths, so the script runs when it is started through a symlinked
// file or a symlinked repo folder, and still does nothing when another module imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";
import { SCRIPTS, checkout, git } from "./pr-rules-fakes.mjs";

const symlinks = { skip: process.platform === "win32" ? "making a symlink needs extra rights on Windows" : false };
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n") + "\n";

/** A repo whose branch commits `files` ({ path: text }) on top of main. */
function repoWith(files) {
  const dir = checkout();
  git(dir, "branch", "-M", "main");
  git(dir, "switch", "-q", "-c", "feat/439-guard");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "branch");
  return dir;
}

/** The ways to start pr-size.mjs in `repo`: itself, a symlink to the file, and the script inside a symlinked repo
 * folder. Each is { script, cwd }. */
function starts(repo) {
  const scratch = tmp("onrails-size-link-");
  const script = join(repo, SCRIPTS, "pr-size.mjs");
  symlinkSync(script, join(scratch, "size.mjs"));
  symlinkSync(repo, join(scratch, "link"), "dir");
  return {
    "run directly": { script, cwd: repo },
    "a symlinked file": { script: join(scratch, "size.mjs"), cwd: repo },
    "a symlinked repo folder": { script: join(scratch, "link", SCRIPTS, "pr-size.mjs"), cwd: join(scratch, "link") },
  };
}

const run = ({ script, cwd }, args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env: safeEnv() });

test("AC-439-1: WHEN pr-size.mjs is started through a symlinked file or repo folder THEN it counts and exits as it does run directly", symlinks, () => {
  const small = starts(repoWith({ "src/a.ts": lines(10) }));
  const big = starts(repoWith({ "src/a.ts": lines(1000) }));
  const cases = [
    [small, ["--base", "no-such-ref"], 2, /Couldn't count the size/],
    [small, ["--base", "main"], 0, /HEAD against main: 10 changed lines counted/],
    [big, ["--base", "main"], 1, /HEAD against main: 1000 changed lines counted/],
  ];
  for (const [set, args, status, out] of cases) {
    for (const [name, start] of Object.entries(set)) {
      const r = run(start, args);
      assert.equal(r.status, status, `${name}, ${args.join(" ")}: ${r.stdout}${r.stderr}`);
      assert.match(status === 2 ? r.stderr : r.stdout, out, `${name}, ${args.join(" ")}`);
    }
  }
});

test("AC-439-2: WHEN pr-size.mjs is imported THEN it doesn't run main", () => {
  const dir = repoWith({ "src/a.ts": lines(1) });
  const importer = join(tmp("onrails-size-import-"), "importer.mjs");
  const url = JSON.stringify(pathToFileURL(join(dir, SCRIPTS, "pr-size.mjs")).href);
  // The importer's own arguments are a call main would answer with exit 2, so a guard that let main run would show.
  writeFileSync(importer, `const size = await import(${url});\nconsole.log(typeof size.main, size.MAX_CHANGED_LINES);\n`);
  const r = spawnSync(process.execPath, [importer, "--base", "no-such-ref"], { cwd: dir, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "function 1000\n");
  assert.equal(r.stderr, "");
});
