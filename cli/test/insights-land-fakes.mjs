// Shared set-up for the #332 tests (insights-land and insights-verify): a temp bare remote, the coordinator's clone of
// it with a copy of the coordinate scripts, and insights.mjs run against a fake gh. Fake claude and codex sit next to
// the fake gh and log any call: none is expected.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { fake, fakeGh, safeEnv, tmp } from "./helpers.mjs";
import { findCommand } from "../src/system.mjs";
import { dayFolder, fileName, validate } from "../src/insights-record.mjs";

export const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const SCRIPTS = ".agents/skills/coordinate/scripts";
export const SHA = "c".repeat(40);
export const ME = "loop-bot";
const NOW = "2026-11-27T14:32:00Z";
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "loop", GIT_AUTHOR_EMAIL: "loop@example.invalid", GIT_COMMITTER_NAME: "loop", GIT_COMMITTER_EMAIL: "loop@example.invalid",
};

export const record = (kind, fields) => ({
  v: 1, kind, at: "2026-11-27T14:10:00.000Z", issue: 12, pr: 40, sha: SHA, job: "review-code", tool: "claude-code",
  model: "unknown", effort: "unknown", ...fields,
});
export const REVIEW = record("review", { round: 1, verdict: "pass", must: 0, nice: 2, categories: ["tests"] });
export const JOB = record("job", { outcome: "pass" });
/** A record already on main before each test. */
export const OLD = record("job", { at: "2026-11-26T09:00:00.000Z", outcome: "finished", job: "build" });
export const pathOf = (r, id = "a1b2c3") => `${dayFolder(r)}/${fileName(r, id)}`;
/** A record's file text, as the writer writes it. */
export const json = (r) => `${JSON.stringify(r, null, 2)}\n`;

export function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: safeEnv(GIT_ENV) });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

export function put(dir, path, text) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** A temp bare remote whose main holds OLD, and the coordinator's clone of it with a copy of the coordinate scripts. */
export function setup() {
  for (const r of [REVIEW, JOB, OLD]) assert.deepEqual(validate(r), [], `fixture ${JSON.stringify(r)}`);
  const root = tmp("onrails-land-");
  git(root, "init", "-q", "--bare", "-b", "main", "remote.git");
  git(root, "clone", "-q", "remote.git", "seed");
  put(join(root, "seed"), pathOf(OLD), json(OLD));
  put(join(root, "seed"), "README.md", "app\n");
  git(join(root, "seed"), "add", "-A");
  git(join(root, "seed"), "commit", "-q", "-m", "init");
  git(join(root, "seed"), "push", "-q", "origin", "HEAD:main");
  git(root, "clone", "-q", "remote.git", "main");
  const dir = join(root, "main");
  cpSync(join(REPO, SCRIPTS), join(dir, SCRIPTS), { recursive: true });
  return { root, dir, seed: join(root, "seed") };
}

/**
 * Runs insights.mjs in dir against a fake gh answering `api`, with `env` added. Returns the result and the gh calls.
 * `logGitEnv` puts a git in front of the real one that keeps each call's args and GIT_ variables, as `gitEnv`.
 */
export function run(dir, args, api = {}, { env = {}, logGitEnv = false } = {}) {
  const ghDir = tmp("onrails-gh-");
  const log = join(ghDir, "agents.log");
  for (const name of ["claude", "codex"]) fake(join(ghDir, "bin"), name, `#!/bin/sh\necho "${name} $*" >> '${log}'\n`);
  const envLog = join(ghDir, "git-env.log");
  if (logGitEnv) fake(join(ghDir, "bin"), "git", `#!/bin/sh\n{ echo "git $*"; env | grep '^GIT_' | sort; echo; } >> '${envLog}'\nexec '${findCommand("git")}' "$@"\n`);
  const gh = fakeGh(ghDir, { user: { login: ME }, ...api }, { ...GIT_ENV, ONRAILS_NOW: NOW, ...env });
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "insights.mjs"), ...args], { cwd: dir, encoding: "utf8", env: gh.env });
  assert.equal(existsSync(log) ? readFileSync(log, "utf8") : "", "", "no claude or codex call");
  return { ...r, calls: gh.calls(), gitEnv: existsSync(envLog) ? readFileSync(envLog, "utf8") : "" };
}

/** Writes two new records into the checkout, as a reviewer's harvest and the gate would, and returns their paths, sorted. */
export function twoNew(dir) {
  put(dir, pathOf(REVIEW, "d4e5f6"), json(REVIEW));
  put(dir, pathOf(JOB, "0a0b0c"), json(JOB));
  return [pathOf(REVIEW, "d4e5f6"), pathOf(JOB, "0a0b0c")].sort();
}

/** Every record file under dir's docs/insights/, as { path: parsed record }. */
export function records(dir) {
  const root = join(dir, "docs/insights");
  if (!existsSync(root)) return {};
  return Object.fromEntries(readdirSync(root).flatMap((day) => readdirSync(join(root, day)).map((name) =>
    [`docs/insights/${day}/${name}`, JSON.parse(readFileSync(join(root, day, name), "utf8"))])));
}

/**
 * Pushes a branch off `from` (main by default) with `files` ({ path: text }) to the remote, after `change(seed)` if
 * given, and returns its head sha.
 */
export function branch(seed, name, files, from = "origin/main", change = () => {}) {
  git(seed, "fetch", "-q", "origin");
  git(seed, "checkout", "-q", "-B", name, from);
  for (const [p, text] of Object.entries(files)) put(seed, p, text);
  change(seed);
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", name);
  git(seed, "push", "-q", "origin", `HEAD:refs/heads/${name}`);
  return git(seed, "rev-parse", "HEAD");
}

/** The line the size rule (#377) reads in a records pull request's body. */
export const SIZE_LINE = "Size exception: insights records only, each checked by land --verify";

/** The pull request object gh returns: opened by `login`, head repo id `headId` (null: a deleted fork). */
export function pullOf(n, ref, sha, { login = ME, headId = 1, headName = "acme/app", labels = [], body = "" } = {}) {
  return {
    number: n, user: { login }, body, labels: labels.map((name) => ({ name })),
    head: { ref, sha, repo: headId === null ? null : { id: headId, full_name: headName } },
    base: { ref: "main", repo: { id: 1, full_name: "acme/app" } },
  };
}
