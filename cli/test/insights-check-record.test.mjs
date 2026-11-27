// The local gate's check record (#331): mark-check.mjs --record writes one `check` insights record before it posts
// the status, whether the post lands or is refused, and none on a usage error. A copy of the coordinate scripts runs
// against a fake gh in a temp git repo that stands in for the coordinator's checkout of main. Step 6.1 is text the
// agents read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { fakeGh, nodeOnly, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { TEXT_CAP, validate } from "../src/insights-record.mjs";
import { findCommand } from "../src/system.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPTS = ".agents/skills/coordinate/scripts";
const SHA = "c".repeat(40);
const NOW = "2026-11-27T14:32:00Z";
const DAY = "docs/insights/2026-11-27";

/** The file the gate writes in step 6.1.4: a pass with one skipped command. */
const PASS = {
  pr: 40,
  fence: "Fence: bubblewrap",
  commands: [
    { command: "pnpm install", result: "pass", seconds: 31 },
    { command: "pnpm check", result: "pass", seconds: 95.5 },
    { command: "pnpm test:e2e", result: "skipped", seconds: 0 },
  ],
  failed: null,
  rerun: false,
};

/** The record PASS must give, field by field, from the issue: the sha, pr, state, fence and every command. */
const EXPECTED = {
  v: 1, kind: "check", at: "2026-11-27T14:32:00.000Z", issue: null, pr: 40, sha: SHA, job: null, tool: null,
  model: "unknown", effort: "unknown", state: "success", fence: "Fence: bubblewrap",
  commands: [
    { name: "pnpm install", result: "pass", seconds: 31 },
    { name: "pnpm check", result: "pass", seconds: 95.5 },
    { name: "pnpm test:e2e", result: "skipped", seconds: 0 },
  ],
  failed_step: null, flaky_rerun: false,
};

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: safeEnv({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }) });
  assert.equal(r.status, 0, r.stderr);
}

/** A temp git repo standing in for the coordinator's checkout of main, with a copy of the coordinate scripts. */
function checkout({ docs = true } = {}) {
  const dir = tmp("onrails-check-main-");
  git(dir, "init", "-q", "-b", "main");
  cpSync(join(REPO, SCRIPTS), join(dir, SCRIPTS), { recursive: true });
  if (docs) mkdirSync(join(dir, "docs"));
  return dir;
}

/** A PATH of a copy of node and a folder holding only a link to git: no system folder, so no gh of any kind. */
function nodeAndGit() {
  const bin = tmp("onrails-git-only-");
  symlinkSync(findCommand("git"), join(bin, "git"));
  return [nodeOnly(), bin].join(delimiter);
}

/** Writes the gate's record file in its own folder (raw text as is, anything else as JSON) and returns its path. */
function gateFile(content) {
  const path = join(tmp("onrails-gate-"), "record.json");
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

const REFUSED = { ghError: "gh: Write access to this GitHub API path is not permitted through this proxy (HTTP 403)" };
const requires = (context) => [{ type: "required_status_checks", parameters: { required_status_checks: [{ context }] } }];

/**
 * mark-check.mjs in a fresh checkout, run from `cwd` (the checkout itself by default). `status` answers the POST,
 * `rules` main's rules; `noGh` leaves gh off PATH; `docs: false` leaves the checkout without its docs/ folder.
 */
function mark({ record, state = "success", status = {}, rules = [], noGh = false, extra = [], docs = true, cwd } = {}) {
  const dir = checkout({ docs });
  const fake = fakeGh(tmp("onrails-gh-"), {
    [`repos/acme/app/statuses/${SHA}`]: status,
    "repos/acme/app": { default_branch: "main" },
    "repos/acme/app/rules/branches/main": rules,
    "repos/acme/app/branches/main": { name: "main", protection: { required_status_checks: { contexts: [], checks: [] } } },
  }, { ONRAILS_NOW: NOW });
  // The fake gh comes first on fake.env's PATH. With noGh, no folder on PATH holds a gh: not even the machine's own.
  const env = noGh ? safeEnv({ ONRAILS_NOW: NOW, PATH: nodeAndGit() }) : fake.env;
  if (noGh) assert.ok(env.PATH.split(delimiter).every((d) => !existsSync(join(d, "gh"))), `no gh on ${env.PATH}`);
  const args = [SHA, "--repo", "acme/app", "--state", state, ...(record ? ["--record", record] : []), ...extra];
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "mark-check.mjs"), ...args], { cwd: cwd ?? dir, encoding: "utf8", env });
  return { ...r, dir, calls: fake.calls() };
}

/** How many times gh posted the status. */
const posts = (calls) => calls.split("\n").filter((l) => l.startsWith("api -X POST")).length;

/** Every record under the checkout's docs/insights/, with its file name. */
function records(dir) {
  const root = join(dir, "docs/insights");
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((day) =>
    readdirSync(join(root, day)).map((name) => ({ path: `docs/insights/${day}/${name}`, name, record: JSON.parse(readFileSync(join(root, day, name), "utf8")) })));
}

test("AC-331-1: WHEN mark-check.mjs <sha> --repo o/n --state success --record <file> runs against a fake gh that accepts THEN one check record exists with that sha, every command from the file and failed: null", unixOnly, () => {
  const r = mark({ record: gateFile(PASS) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.calls, new RegExp(`-X POST -f state=success -f context=onrails/check .*repos/acme/app/statuses/${SHA}`));
  const found = records(r.dir);
  assert.equal(found.length, 1, "one record");
  const [{ path, name, record }] = found;
  assert.ok(path.startsWith(`${DAY}/`), path);
  assert.match(name, /^1432-check-40-[0-9a-f]{6}\.json$/);
  assert.deepEqual(record, EXPECTED);
  assert.deepEqual(validate(record), [], "a valid record of the #329 format");
  assert.ok(r.stdout.includes(path), "it prints where the record went");
});

test("AC-331-2: WHEN the fake gh refuses the post (exit 1 and exit 3 paths) THEN the record is still written, with the same fields", unixOnly, () => {
  const cases = [
    { why: "refused, main doesn't require it", status: REFUSED, rules: requires("vercel"), exit: 1 },
    { why: "refused, main requires it", status: REFUSED, rules: requires("onrails/check"), exit: 3 },
    { why: "refused, main's rules can't be read", status: REFUSED, rules: { ghError: "HTTP 502: bad gateway" }, exit: 3 },
    { why: "no gh on PATH", noGh: true, exit: 3 },
  ];
  for (const { why, exit, ...opts } of cases) {
    const r = mark({ record: gateFile(PASS), ...opts });
    assert.equal(r.status, exit, `${why}: ${r.stderr}`);
    const found = records(r.dir);
    assert.equal(found.length, 1, why);
    assert.deepEqual(found[0].record, EXPECTED, why);
  }
});

test("AC-331-3: WHEN --record names a missing or malformed file THEN it exits 2 and writes no record and posts no status", unixOnly, () => {
  const { failed: _failed, ...noFailed } = PASS;
  const bad = {
    missing: join(tmp("onrails-gate-"), "nothing-here.json"),
    "not JSON": gateFile("{ not json"),
    "a list, not an object": gateFile([PASS]),
    "no commands": gateFile({ ...PASS, commands: [] }),
    "a command with no name": gateFile({ ...PASS, commands: [{ result: "pass", seconds: 1 }] }),
    "a result that isn't pass, fail or skipped": gateFile({ ...PASS, commands: [{ command: "pnpm check", result: "maybe", seconds: 1 }] }),
    "negative seconds": gateFile({ ...PASS, commands: [{ command: "pnpm check", result: "pass", seconds: -1 }] }),
    "no pr": gateFile({ ...PASS, pr: undefined }),
    "no failed": gateFile(noFailed),
    "rerun that isn't true or false": gateFile({ ...PASS, rerun: "yes" }),
  };
  for (const [why, record] of Object.entries(bad)) {
    const r = mark({ record });
    assert.equal(r.status, 2, `${why}: ${r.stderr}`);
    assert.match(r.stderr, /--record/, why);
    assert.deepEqual(records(r.dir), [], `${why}: no record`);
    assert.equal(r.calls, "", `${why}: no status posted`);
  }
  const noPath = mark({ extra: ["--record"] });
  assert.equal(noPath.status, 2, "--record with no file");
  assert.equal(noPath.calls, "");
});

test("AC-331-1: the record's fence keeps its first line without control characters, capped at 200 characters after they go", unixOnly, () => {
  const cases = [
    { why: "escape, carriage return, tab, DEL and C1", fence: "Fence: none (bwrap \u001b[31mred\r\tx\u007f\u009b)\nsecond", want: "Fence: none (bwrap [31mredx)" },
    { why: "the cap counts what is left", fence: `Fence: ${"\u0007".repeat(100)}${"a".repeat(250)}`, want: `Fence: ${"a".repeat(TEXT_CAP - 7)}` },
  ];
  for (const { why, fence, want } of cases) {
    const r = mark({ record: gateFile({ ...PASS, fence }) });
    assert.equal(r.status, 0, `${why}: ${r.stderr}`);
    const found = records(r.dir);
    assert.equal(found.length, 1, why);
    assert.equal(found[0].record.fence, want, why);
  }
});

test("AC-331-3: WHEN a command name or the failed step is over 200 characters or holds a control character THEN it exits 2 and writes no record and posts no status", unixOnly, () => {
  const named = (command) => ({ ...PASS, commands: [{ command, result: "fail", seconds: 3 }], failed: "pnpm check" });
  const bad = {
    "a command over 200 characters": named("x".repeat(TEXT_CAP + 1)),
    "a command with an escape": named("pnpm check\u001b[2J"),
    "a command with a carriage return": named("pnpm check\rok"),
    "a command with a tab": named("pnpm\tcheck"),
    "a command with DEL": named("pnpm check\u007f"),
    "a command with a C1 character": named("pnpm check\u0085"),
    "a failed step with an escape": { ...named("pnpm check"), failed: "pnpm check\u001b[2J" },
  };
  for (const [why, gate] of Object.entries(bad)) {
    const r = mark({ record: gateFile(gate), state: "failure" });
    assert.equal(r.status, 2, `${why}: ${r.stderr}`);
    assert.match(r.stderr, /--record .*commands|--record .*failed/, why);
    assert.deepEqual(records(r.dir), [], `${why}: no record`);
    assert.equal(r.calls, "", `${why}: no status posted`);
  }
  const longest = mark({ record: gateFile(named("x".repeat(TEXT_CAP))), state: "failure" });
  assert.equal(longest.status, 0, `exactly ${TEXT_CAP} characters is fine: ${longest.stderr}`);
  assert.equal(records(longest.dir)[0].record.commands[0].name, "x".repeat(TEXT_CAP));
});

test("#331: a record that can't be written is a warning, and the status is still posted once", unixOnly, () => {
  const cases = [
    { why: "accepted", status: {}, exit: 0 },
    { why: "refused, main doesn't require it", status: REFUSED, rules: requires("vercel"), exit: 1 },
  ];
  for (const { why, exit, ...opts } of cases) {
    // A checkout with no docs/ folder, run from a folder outside any git repo.
    const r = mark({ record: gateFile(PASS), docs: false, cwd: tmp("onrails-not-git-"), ...opts });
    assert.equal(r.status, exit, `${why}: ${r.stderr}`);
    assert.match(r.stderr, /Insights: couldn't write the check record \(.+\)\. Posting the status anyway\./, why);
    assert.equal(posts(r.calls), 1, `${why}: one post`);
    assert.deepEqual(records(r.dir), [], `${why}: no record`);
  }
});

test("#331: the record lands in the script's own checkout, whichever folder it runs from", unixOnly, () => {
  const elsewhere = checkout();
  const r = mark({ record: gateFile(PASS), cwd: elsewhere });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(records(r.dir).length, 1, "one record in the script's checkout");
  assert.deepEqual(records(elsewhere), [], "none in the folder it ran from");
});

test("#331: without --record, mark-check posts as before and writes no record", unixOnly, () => {
  const r = mark();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(records(r.dir), []);
});

test("AC-331-4: WHEN a command failed once and passed on a rerun THEN the record has rerun: true and that command's result is pass", unixOnly, () => {
  const rerun = { ...PASS, commands: [{ command: "pnpm check", result: "pass", seconds: 120 }], rerun: true };
  const r = mark({ record: gateFile(rerun) });
  assert.equal(r.status, 0, r.stderr);
  const found = records(r.dir);
  assert.equal(found.length, 1, "one record");
  const [{ record }] = found;
  assert.equal(record.flaky_rerun, true);
  assert.deepEqual(record.commands, [{ name: "pnpm check", result: "pass", seconds: 120 }]);
  assert.equal(record.failed_step, null);
  // A red gate names its failed step.
  const red = { ...PASS, commands: [{ command: "pnpm check", result: "fail", seconds: 40 }], failed: "pnpm check" };
  const f = mark({ record: gateFile(red), state: "failure" });
  assert.equal(f.status, 0, f.stderr);
  const reds = records(f.dir);
  assert.equal(reds.length, 1, "one record");
  const [{ record: failure }] = reds;
  assert.equal(failure.state, "failure");
  assert.equal(failure.failed_step, "pnpm check");
  assert.equal(failure.flaky_rerun, false);
});

test("AC-331-5: WHEN coordinate/SKILL.md step 6.1 is read THEN it says to time each command, write the record file and pass --record", () => {
  const text = readFileSync(join(REPO, ".agents/skills/coordinate/SKILL.md"), "utf8");
  const step = text.slice(text.indexOf("1. **Local checks**"), text.indexOf("2. **Code review.**"));
  assert.match(step, /\*\*Time each command\*\*/);
  assert.match(step, /`rerun: true`/);
  assert.match(step, /write the gate's record file/i);
  assert.match(step, /"commands": \[\{"command": "pnpm check", "result": "pass", "seconds": 42\}\], "failed": null, "rerun": false/);
  assert.match(step, /mark-check\.mjs <sha> --repo <owner>\/<repo> --state success --record <record>/);
  assert.match(step, /--state failure --description "<red command> failed" --record <record>/);
  assert.match(step, /on exit 0, 1 and 3 alike/);
});
