// The local gate's check record (#331): mark-check.mjs --record writes one `check` insights record before it posts
// the status, whether the post lands or is refused, and none on a usage error. The script runs against a fake gh in a
// temp git repo that stands in for the coordinator's checkout of main. Step 6.1 is text the agents read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { validate } from "../src/insights-record.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPT = join(REPO, ".agents/skills/coordinate/scripts/mark-check.mjs");
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

/** A temp git repo standing in for the coordinator's checkout of main. */
function checkout() {
  const dir = tmp("onrails-check-main-");
  git(dir, "init", "-q", "-b", "main");
  return dir;
}

/** Writes the gate's record file in its own folder (raw text as is, anything else as JSON) and returns its path. */
function gateFile(content) {
  const path = join(tmp("onrails-gate-"), "record.json");
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

const REFUSED = { ghError: "gh: Write access to this GitHub API path is not permitted through this proxy (HTTP 403)" };
const requires = (context) => [{ type: "required_status_checks", parameters: { required_status_checks: [{ context }] } }];

/** mark-check.mjs in a fresh checkout. `status` answers the POST, `rules` main's rules; `noGh` leaves gh off PATH. */
function mark({ record, state = "success", status = {}, rules = [], noGh = false, extra = [] } = {}) {
  const dir = checkout();
  const fake = fakeGh(tmp("onrails-gh-"), {
    [`repos/acme/app/statuses/${SHA}`]: status,
    "repos/acme/app": { default_branch: "main" },
    "repos/acme/app/rules/branches/main": rules,
    "repos/acme/app/branches/main": { name: "main", protection: { required_status_checks: { contexts: [], checks: [] } } },
  }, { ONRAILS_NOW: NOW });
  const env = noGh ? safeEnv({ ONRAILS_NOW: NOW }) : fake.env;
  const args = [SHA, "--repo", "acme/app", "--state", state, ...(record ? ["--record", record] : []), ...extra];
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env });
  return { ...r, dir, calls: fake.calls() };
}

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
