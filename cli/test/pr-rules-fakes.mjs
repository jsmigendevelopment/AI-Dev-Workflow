// The fixture for pr-rules.mjs (#225): main's checkout as a temp git repo whose one commit holds copies of the
// coordinate scripts and `attributes` as its .gitattributes, and a fake gh that answers for pull request 9 of acme/app.
// The script reads main's attributes from the checkout that holds it, so each run copies it into one.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeGh, safeEnv, tmp } from "./helpers.mjs";

export const HEAD = "d".repeat(40);
export const SCRIPTS = ".agents/skills/coordinate/scripts";
const source = (name) => fileURLToPath(new URL(`../../${SCRIPTS}/${name}`, import.meta.url));

/** git in `dir`, with no global or system config, for setting up a fixture. Its output as text. */
export const git = (dir, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, encoding: "utf8", env: safeEnv({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }) });

/** Main's checkout: one commit with the scripts and `attributes` as its .gitattributes. Returns its folder. */
export function checkout(attributes = "") {
  const dir = tmp("onrails-rules-");
  git(dir, "init", "-q");
  mkdirSync(join(dir, SCRIPTS), { recursive: true });
  for (const name of ["pr-rules.mjs", "agent-files.mjs"]) copyFileSync(source(name), join(dir, SCRIPTS, name));
  writeFileSync(join(dir, ".gitattributes"), attributes);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "main");
  return dir;
}

// A fake git that logs its arguments, the token variables it got and its config variables, then runs the real one.
const FAKE_GIT = `#!/usr/bin/env node
const fs = require("fs");
const { spawnSync } = require("child_process");
const argv = process.argv.slice(2);
const tokens = Object.keys(process.env).filter((name) => /TOKEN/i.test(name));
fs.appendFileSync(process.env.FAKE_GIT_LOG, JSON.stringify({ argv, tokens, global: process.env.GIT_CONFIG_GLOBAL ?? null, nosystem: process.env.GIT_CONFIG_NOSYSTEM ?? null }) + "\\n");
process.exit(spawnSync(process.env.REAL_GIT, argv, { stdio: "inherit" }).status ?? 1);
`;

const listed = (files) => files.map(([filename, additions, deletions, previous_filename]) => ({ filename, additions, deletions, ...(previous_filename ? { status: "renamed", previous_filename } : {}) }));
const total = (files, i) => files.reduce((sum, f) => sum + f[i], 0);

/** Runs main's pr-rules.mjs on pull request 9: from `branch`, with `body`, `labels` and the files changed ([name,
 * additions, deletions, old name of a rename]). `changed`, `additions` and `deletions` are GitHub's totals, from the
 * list by default. `again` changes the answers from the second read on ({ pull, files }). `env` adds variables, and
 * `logGit` puts the fake git first on PATH; `gitCalls()` reads its log. */
export function rules({ body = "Adds sharing.\n\nCloses #5", branch = "feat/5-share", labels = [], author = "builder", files = [["src/a.ts", 10, 5]], changed, additions, deletions, sha = HEAD, attributes = "", args = ["9", "--repo", "acme/app", "--head", HEAD], again, dir = checkout(attributes), cwd = dir, env = {}, logGit = false } = {}) {
  const pull = {
    number: 9, body, user: { login: author }, labels: labels.map((name) => ({ name })), head: { ref: branch, sha },
    changed_files: changed === undefined ? files.length : changed,
    additions: additions === undefined ? total(files, 1) : additions,
    deletions: deletions === undefined ? total(files, 2) : deletions,
  };
  const fakes = tmp("onrails-gh-");
  const gitLog = join(fakes, "git.log");
  const fake = fakeGh(fakes, {
    "repos/acme/app/pulls/9": again?.pull ? { sequence: [pull, { ...pull, ...again.pull }] } : pull,
    "repos/acme/app/pulls/9/files": again?.files ? { sequence: [listed(files), listed(again.files)] } : listed(files),
  }, { ...env, ...(logGit ? { FAKE_GIT_LOG: gitLog, REAL_GIT: join(git(fakes, "--exec-path").trim(), "git") } : {}) });
  if (logGit) {
    writeFileSync(join(fakes, "bin", "git"), FAKE_GIT);
    chmodSync(join(fakes, "bin", "git"), 0o755);
  }
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-rules.mjs"), ...args], { cwd, encoding: "utf8", env: fake.env });
  const gitCalls = () => (existsSync(gitLog) ? readFileSync(gitLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { ...r, calls: fake.calls(), gitCalls, dir };
}
