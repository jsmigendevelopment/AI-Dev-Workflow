// A check record's commands[].name (#465): validate refuses an empty name and one with a control character, the same
// rule as the local gate's mark-check.mjs, so `land --verify` and the gate agree on what a valid name is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { fakeGh, safeEnv, tmp, unixOnly, put } from "./helpers.mjs";
import { TEXT_CAP, validate } from "../src/insights-record.mjs";
import { recordProblem } from "../../.agents/skills/coordinate/scripts/insights-land.mjs";
import { branch, json, pathOf, pullOf, record, run, setup } from "./insights-land-fakes.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPTS = ".agents/skills/coordinate/scripts";
const CHECK = record("check", { state: "success", fence: "Fence: none", failed_step: null, flaky_rerun: false, commands: [{ name: "pnpm check", result: "pass", seconds: 95.5 }] });
const withName = (name) => ({ ...CHECK, commands: [CHECK.commands[0], { ...CHECK.commands[0], name }] });
const problems = (r) => validate(r).join("; ");

test("AC-465-1: WHEN a commands item's name is an empty string THEN validate refuses it and names commands", () => {
  assert.deepEqual(validate(CHECK), [], "a plain name passes");
  assert.match(problems(withName("")), /^commands: /);
  assert.deepEqual(validate(withName("x")), [], "one character passes");
  assert.deepEqual(validate(withName("n".repeat(TEXT_CAP))), [], `${TEXT_CAP} characters still pass`);
});

test("AC-465-2: WHEN a commands item's name holds a control, format or line-separator character THEN validate refuses it, and land --verify names the file", unixOnly, () => {
  const names = {
    newline: "pnpm check\nsecond", "carriage return": "pnpm check\rok", tab: "pnpm\tcheck", escape: "pnpm check\u001b[2J",
    NUL: "pnpm\u0000check", DEL: "pnpm check\u007f", "C1 (NEL)": "pnpm check\u0085", "C1 (CSI)": "pnpm\u009b31m",
    "zero-width space": "pnpm\u200bcheck", "bidi override": "pnpm check\u202e", BOM: "\ufeffpnpm check", "line separator": "pnpm\u2028check", "paragraph separator": "pnpm\u2029check",
  };
  for (const [why, name] of Object.entries(names)) assert.match(problems(withName(name)), /^commands: /, why);
  const { dir, seed } = setup();
  Object.entries(names).forEach(([why, name], i) => {
    const r = withName(name);
    const n = String(i).padStart(2, "0");
    const ref = `chore/insights-2026-11-27-16${n}`;
    const path = pathOf(r, `cccc${n}`);
    const sha = branch(seed, ref, { [path]: json(r) });
    const got = run(dir, ["land", "--verify", String(70 + i), "--repo", "acme/app"], { [`repos/acme/app/pulls/${70 + i}`]: pullOf(70 + i, ref, sha) });
    assert.equal(got.status, 1, `${why}: ${got.stderr}`);
    assert.ok(got.stderr.includes(path), `${why}: names ${path}: ${got.stderr}`);
  });
});

test("AC-465-3: WHEN every record under docs/insights/ on main is checked with recordProblem THEN all of them pass", () => {
  const top = join(REPO, "docs/insights");
  const files = readdirSync(top).flatMap((day) => readdirSync(join(top, day)).map((name) => `docs/insights/${day}/${name}`));
  assert.ok(files.length > 0);
  assert.ok(files.some((f) => JSON.parse(readFileSync(join(REPO, f), "utf8")).kind === "check"), "main holds check records");
  for (const file of files) assert.equal(recordProblem(file, readFileSync(join(REPO, file))), null, file);
});

test("AC-465-4: WHEN mark-check.mjs --record writes a check record from a valid gate file THEN the record passes validate", unixOnly, () => {
  const sha = "d".repeat(40);
  const dir = tmp("onrails-check-main-");
  assert.equal(spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env: safeEnv({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }) }).status, 0);
  cpSync(join(REPO, SCRIPTS), join(dir, SCRIPTS), { recursive: true });
  mkdirSync(join(dir, "docs"));
  const gate = {
    pr: 41, fence: "Fence: none", failed: null, rerun: false,
    commands: [{ command: "pnpm install", result: "pass", seconds: 31 }, { command: "pnpm check", result: "pass", seconds: 95.5 }, { command: "pnpm test:e2e", result: "skipped", seconds: 0 }],
  };
  const gateDir = tmp("onrails-gate-");
  put(gateDir, "record.json", JSON.stringify(gate));
  const fake = fakeGh(tmp("onrails-gh-"), {
    [`repos/acme/app/statuses/${sha}`]: {}, "repos/acme/app": { default_branch: "main" }, "repos/acme/app/rules/branches/main": [],
    "repos/acme/app/branches/main": { name: "main", protection: { required_status_checks: { contexts: [], checks: [] } } },
  }, { ONRAILS_NOW: "2026-11-27T14:32:00Z" });
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "mark-check.mjs"), sha, "--repo", "acme/app", "--state", "success", "--record", join(gateDir, "record.json")], { cwd: dir, encoding: "utf8", env: fake.env });
  assert.equal(r.status, 0, r.stderr);
  const day = join(dir, "docs/insights/2026-11-27");
  const [name] = readdirSync(day);
  const written = JSON.parse(readFileSync(join(day, name), "utf8"));
  assert.deepEqual(written.commands.map((c) => c.name), ["pnpm install", "pnpm check", "pnpm test:e2e"]);
  assert.deepEqual(validate(written), []);
  assert.equal(recordProblem(`docs/insights/2026-11-27/${name}`, readFileSync(join(day, name))), null, "and it is in the writer's exact bytes");
});
