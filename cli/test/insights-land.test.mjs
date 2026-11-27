// The coordinator harvests reviewers' records and lands them on main (#332): AC-332-1 to AC-332-5.
// A copy of the coordinate scripts runs in a clone of a temp bare remote, against a fake gh. Fake claude and codex
// sit next to the fake gh and log any call: none is expected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { fake, fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { dayFolder, fileName, toLine, validate } from "../src/insights-record.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPTS = ".agents/skills/coordinate/scripts";
const SHA = "c".repeat(40);
const NOW = "2026-11-27T14:32:00Z";
const ME = "loop-bot";
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "loop", GIT_AUTHOR_EMAIL: "loop@example.invalid", GIT_COMMITTER_NAME: "loop", GIT_COMMITTER_EMAIL: "loop@example.invalid",
};

const record = (kind, fields) => ({
  v: 1, kind, at: "2026-11-27T14:10:00.000Z", issue: 12, pr: 40, sha: SHA, job: "review-code", tool: "claude-code",
  model: "unknown", effort: "unknown", ...fields,
});
const REVIEW = record("review", { round: 1, verdict: "pass", must: 0, nice: 2, categories: ["tests"] });
const JOB = record("job", { outcome: "pass" });
/** A record already on main before each test. */
const OLD = record("job", { at: "2026-11-26T09:00:00.000Z", outcome: "finished", job: "build" });
const pathOf = (r, id = "a1b2c3") => `${dayFolder(r)}/${fileName(r, id)}`;
const json = (r) => `${JSON.stringify(r, null, 2)}\n`;

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: safeEnv(GIT_ENV) });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function put(dir, path, text) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** A temp bare remote whose main holds OLD, and the coordinator's clone of it with a copy of the coordinate scripts. */
function setup() {
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

/** Runs insights.mjs in dir against a fake gh answering `api`. Returns the result, the gh calls and the agent calls. */
function run(dir, args, api = {}) {
  const ghDir = tmp("onrails-gh-");
  const log = join(ghDir, "agents.log");
  for (const name of ["claude", "codex"]) fake(join(ghDir, "bin"), name, `#!/bin/sh\necho "${name} $*" >> '${log}'\n`);
  const gh = fakeGh(ghDir, { user: { login: ME }, ...api }, { ...GIT_ENV, ONRAILS_NOW: NOW });
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "insights.mjs"), ...args], { cwd: dir, encoding: "utf8", env: gh.env });
  assert.equal(existsSync(log) ? readFileSync(log, "utf8") : "", "", "no claude or codex call");
  return { ...r, calls: gh.calls() };
}

/** Every record file under dir's docs/insights/, as { path: parsed record }. */
function records(dir) {
  const root = join(dir, "docs/insights");
  if (!existsSync(root)) return {};
  return Object.fromEntries(readdirSync(root).flatMap((day) => readdirSync(join(root, day)).map((name) =>
    [`docs/insights/${day}/${name}`, JSON.parse(readFileSync(join(root, day, name), "utf8"))])));
}

const comment = (id, login, body) => ({ id, user: { login }, body });
const COMMENTS = "repos/acme/app/issues/40/comments";
const harvest = (dir, comments) => run(dir, ["harvest", "--pr", "40", "--repo", "acme/app"], { [COMMENTS]: comments });
const sorted = (list) => list.map((r) => JSON.stringify(r)).sort();

test("AC-332-1: WHEN a fake gh returns three comments, two with valid insights lines from the coordinator's login and one from another login THEN harvest writes exactly the two records, and running it again writes nothing new", unixOnly, () => {
  const { dir } = setup();
  const stranger = record("review", { round: 9, verdict: "changes", must: 3, nice: 0 });
  const comments = [
    comment(1, ME, `Review · ${SHA} · approve\n\n${toLine(JOB)}`),
    comment(2, "someone-else", `Looks fine.\n${toLine(stranger)}`),
    comment(3, ME, `Verdict\n${toLine(REVIEW)}\n`),
  ];
  const first = harvest(dir, comments);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.calls, /--paginate .*repos\/acme\/app\/issues\/40\/comments/);
  const after = records(dir);
  const fresh = Object.keys(after).filter((p) => p !== pathOf(OLD));
  assert.equal(fresh.length, 2, `two new records: ${fresh}`);
  assert.deepEqual(sorted(fresh.map((p) => after[p])), sorted([JOB, REVIEW]));
  for (const p of fresh) assert.ok(first.stdout.includes(p), `it prints ${p}`);
  assert.match(first.stderr, /someone-else/, "it names the comment it didn't trust");

  const again = harvest(dir, comments);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(Object.keys(records(dir)).sort(), Object.keys(after).sort(), "nothing new");
  assert.doesNotMatch(again.stdout, /docs\/insights/);
});

test("AC-332-1: a login listed under [insights] writers in docs/profile.toml counts, in any case", unixOnly, () => {
  const { dir } = setup();
  put(dir, "docs/profile.toml", '[board]\ndir = "x"\n\n[insights]\nwriters = ["review-bot", "qa-bot"]\n');
  const r = harvest(dir, [comment(5, "Review-Bot", toLine(REVIEW)), comment(6, "other", toLine(JOB))]);
  assert.equal(r.status, 0, r.stderr);
  const fresh = Object.entries(records(dir)).filter(([p]) => p !== pathOf(OLD)).map(([, rec]) => rec);
  assert.deepEqual(fresh, [REVIEW]);
});

test("AC-332-2: WHEN a comment's line fails validate THEN harvest skips it, names it, and exits 0", unixOnly, () => {
  const { dir } = setup();
  const bad = { ...REVIEW, verdict: "maybe" };
  const r = harvest(dir, [
    comment(7, ME, `${toLine(bad)}\n${toLine(JOB)}`),
    comment(8, ME, "<!-- onrails-insights {not json} -->"),
  ]);
  assert.equal(r.status, 0, r.stderr);
  const fresh = Object.entries(records(dir)).filter(([p]) => p !== pathOf(OLD)).map(([, rec]) => rec);
  assert.deepEqual(fresh, [JOB], "only the valid record");
  assert.match(r.stderr, /comment 7 .*verdict/, "names the comment and the field");
  assert.match(r.stderr, /comment 8 .*JSON/, "names the line that isn't JSON");
});

/** Writes two new records into the checkout with the writer, as a reviewer's harvest and the gate would. */
function twoNew(dir) {
  put(dir, pathOf(REVIEW, "d4e5f6"), json(REVIEW));
  put(dir, pathOf(JOB, "0a0b0c"), json(JOB));
  return [pathOf(REVIEW, "d4e5f6"), pathOf(JOB, "0a0b0c")].sort();
}
const BRANCH = "chore/insights-2026-11-27-1432";
const PULLS = { "repos/acme/app/pulls": { number: 77 }, "repos/acme/app/issues/77/labels": [{ name: "no-issue" }] };

test("AC-332-3: WHEN the checkout has two record files not on origin/main (a temp bare remote) THEN land pushes a chore/insights-… branch whose diff from main is exactly those two added files", unixOnly, () => {
  const { dir } = setup();
  const added = twoNew(dir);
  const r = run(dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "77\n", "prints the pull request's number");
  git(dir, "fetch", "-q", "origin");
  const diff = git(dir, "diff", "--name-status", "--no-renames", `origin/main...origin/${BRANCH}`);
  assert.deepEqual(diff.split("\n").sort(), added.map((p) => `A\t${p}`));
  assert.equal(git(dir, "rev-parse", `origin/${BRANCH}^`), git(dir, "rev-parse", "origin/main"), "one commit on main");
  assert.ok(r.calls.includes(`-f head=${BRANCH} -f base=main repos/acme/app/pulls\n`), r.calls);
  assert.match(r.calls, /-X POST .*labels\[\]=no-issue .*repos\/acme\/app\/issues\/77\/labels/);
});

test("#332: after the records pull request merges, the coordinator's git pull --ff-only is clean", unixOnly, () => {
  const { dir, seed } = setup();
  twoNew(dir);
  assert.equal(run(dir, ["land", "--repo", "acme/app"], PULLS).status, 0);
  git(seed, "fetch", "-q", "origin");
  git(seed, "push", "-q", "origin", `origin/${BRANCH}:refs/heads/main`);
  git(dir, "pull", "-q", "--ff-only", "origin", "main");
  assert.equal(git(dir, "status", "--porcelain", "--", "docs"), "", "nothing left to land");
  const again = run(dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.stdout, "");
});

test("#332: land with nothing pending prints nothing, exits 0 and calls no API; an invalid file is named and left out", unixOnly, () => {
  const { dir } = setup();
  const quiet = run(dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stdout, "");
  assert.equal(quiet.calls, "");
  const bad = pathOf({ ...REVIEW, at: "2026-11-27T15:00:00.000Z" }, "ffffff");
  put(dir, bad, json({ ...REVIEW, verdict: "maybe" }));
  const r = run(dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
  assert.ok(r.stderr.includes(bad), "names the invalid file");
});

/** Pushes a branch off main with `files` ({ path: text }) to the remote, and returns its head sha. */
function branch(seed, name, files) {
  git(seed, "fetch", "-q", "origin");
  git(seed, "checkout", "-q", "-B", name, "origin/main");
  for (const [p, text] of Object.entries(files)) put(seed, p, text);
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", name);
  git(seed, "push", "-q", "origin", `HEAD:refs/heads/${name}`);
  return git(seed, "rev-parse", "HEAD");
}

const pull = (n, ref, sha, login = ME) => ({
  [`repos/acme/app/pulls/${n}`]: {
    number: n, user: { login }, head: { ref, sha, repo: { full_name: "acme/app" } }, base: { ref: "main", repo: { full_name: "acme/app" } },
  },
});
const verify = (dir, n, api) => run(dir, ["land", "--verify", String(n), "--repo", "acme/app"], api);

test("AC-332-4: WHEN land --verify sees a changed file outside docs/insights/, a changed (not added) record, or an invalid record THEN it exits 1 and names the file", unixOnly, () => {
  const { dir, seed } = setup();
  const good = { [pathOf(REVIEW)]: json(REVIEW), [pathOf(JOB)]: json(JOB) };
  const okSha = branch(seed, "chore/insights-2026-11-27-1400", good);
  const ok = verify(dir, 90, pull(90, "chore/insights-2026-11-27-1400", okSha));
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(okSha), "prints the head it checked");

  const badRecord = pathOf({ ...REVIEW, at: "2026-11-27T15:00:00.000Z" }, "eeeeee");
  const cases = [
    { why: "a file outside docs/insights/", files: { ...good, "README.md": "changed\n" }, names: "README.md" },
    { why: "a changed record", files: { [pathOf(OLD)]: json({ ...OLD, outcome: "failed" }) }, names: pathOf(OLD) },
    { why: "an invalid record", files: { [badRecord]: json({ ...REVIEW, at: "2026-11-27T15:00:00.000Z", verdict: "maybe" }) }, names: badRecord },
    { why: "a record whose name doesn't match it", files: { "docs/insights/2026-11-27/0000-job-1-abcdef.json": json(JOB) }, names: "0000-job-1-abcdef.json" },
  ];
  cases.forEach(({ why, files, names }, i) => {
    const ref = `chore/insights-2026-11-27-150${i}`;
    const n = 91 + i;
    const r = verify(dir, n, pull(n, ref, branch(seed, ref, files)));
    assert.equal(r.status, 1, `${why}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stderr.includes(names), `${why}: names ${names} in ${r.stderr}`);
  });
});

test("#332: land --verify refuses a pull request the coordinator didn't open, or one whose head moved", unixOnly, () => {
  const { dir, seed } = setup();
  const ref = "chore/insights-2026-11-27-1600";
  const sha = branch(seed, ref, { [pathOf(REVIEW)]: json(REVIEW) });
  const other = verify(dir, 95, pull(95, ref, sha, "someone-else"));
  assert.equal(other.status, 1, other.stderr);
  assert.match(other.stderr, /someone-else/);
  const notChore = verify(dir, 96, pull(96, "feat/12-x", sha));
  assert.equal(notChore.status, 1, notChore.stderr);
  const moved = verify(dir, 97, pull(97, ref, "d".repeat(40)));
  assert.equal(moved.status, 2, moved.stderr);
});

test("AC-332-5: WHEN coordinate/SKILL.md is read THEN step 9 names harvest and the sweep's end names land and --verify", () => {
  const text = readFileSync(join(REPO, ".agents/skills/coordinate/SKILL.md"), "utf8");
  const step9 = text.slice(text.indexOf("9. **Record it.**"), text.indexOf("10. **End of sweep:**"));
  const step10 = text.slice(text.indexOf("10. **End of sweep:**"), text.indexOf("## End of a pass"));
  assert.match(step9, /`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs harvest --pr <n> --repo <owner>\/<repo>`/);
  assert.match(step10, /`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs land --repo <owner>\/<repo>`/);
  assert.match(step10, /insights\.mjs land --verify <records pr> --repo <owner>\/<repo>/);
  const local = readFileSync(join(REPO, ".agents/skills/coordinate/references/local-mode.md"), "utf8");
  assert.match(local, /insights\.mjs harvest/);
  assert.match(local, /docs\/insights\/.*with the next merge|with the next merge.*docs\/insights\//);
});

test("#332: every record harvest and land touch passes validate", () => {
  for (const r of [REVIEW, JOB, OLD]) assert.deepEqual(validate(r), [], JSON.stringify(r));
});
