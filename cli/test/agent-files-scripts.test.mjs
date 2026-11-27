// Tests for #163: a change to a package.json's scripts, or to the keys that hold check config inline, counts as
// check code for the agent-file guard. A dependency bump doesn't. The guard compares parsed JSON at the merge base
// and at the head, and fails closed on a side it can't read or parse. `gate` reads both sides through a fake gh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "../../.agents/skills/coordinate/scripts/agent-files.mjs";
import { spawnSync } from "./child.mjs";
import { fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/agent-files.mjs", import.meta.url));
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const HEAD = "a".repeat(40);
const MERGE_BASE = "d".repeat(40);
const FULL = "## Automation level\n\n- **Level:** full\n";
const RECOMMENDED = "## Automation level\n\n- **Level:** recommended\n";
const json = (o) => `${JSON.stringify(o, null, 2)}\n`;
const PKG = { name: "app", scripts: { check: "pnpm knip && pnpm lint && pnpm test", lint: "eslint ." }, dependencies: { react: "19.1.0" } };
const BUMPED = { ...PKG, dependencies: { react: "19.1.1" } };
const WEAKER = { ...PKG, scripts: { ...PKG.scripts, check: "pnpm lint && pnpm test" } };
const recommended = (packages, more = {}) => decide({ changed: Object.keys(packages), packages, stack: RECOMMENDED, ...more });

test("AC-163-1: WHEN package.json changes only dependencies (a version bump) THEN decide passes", () => {
  const r = recommended({ "package.json": { base: json(PKG), head: json(BUMPED) } });
  assert.equal(r.pass, true, r.why);
  assert.equal(recommended({ "package.json": { base: json(PKG), head: json({ ...PKG, devDependencies: { knip: "5.0.0" } }) } }).pass, true,
    "adding a dev dependency is a dependency change too");
});

test("AC-163-2: WHEN package.json's scripts.check loses `pnpm knip &&` THEN decide fails on Recommended with no label and names package.json (scripts)", () => {
  const r = recommended({ "package.json": { base: json(PKG), head: json(WEAKER) } });
  assert.equal(r.pass, false);
  assert.match(r.why, /human-approved/);
  assert.match(r.why, /^package\.json \(scripts\)$/m);
});

test("AC-163-2: the script: --files and --packages with the weaker check script exit 1 and name package.json (scripts)", () => {
  const dir = tmp("onrails-agent-files-pkg-");
  const run = (head) => {
    writeFileSync(join(dir, "files.json"), JSON.stringify([{ filename: "package.json", status: "modified" }]));
    writeFileSync(join(dir, "packages.json"), JSON.stringify({ "package.json": { base: json(PKG), head: json(head) } }));
    writeFileSync(join(dir, "stack.md"), RECOMMENDED);
    const args = ["--files", join(dir, "files.json"), "--packages", join(dir, "packages.json"), "--stack", join(dir, "stack.md")];
    return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: safeEnv() });
  };
  const weak = run(WEAKER);
  assert.equal(weak.status, 1, weak.stdout);
  assert.match(weak.stderr, /package\.json \(scripts\)/);
  const bump = run(BUMPED);
  assert.equal(bump.status, 0, bump.stderr);
});

test("AC-163-3: WHEN apps/web/package.json adds a new script THEN decide fails the same way", () => {
  const added = { ...PKG, scripts: { ...PKG.scripts, "test:quick": "vitest run --bail 1" } };
  const r = recommended({ "apps/web/package.json": { base: json(PKG), head: json(added) } });
  assert.equal(r.pass, false);
  assert.match(r.why, /^apps\/web\/package\.json \(scripts\)$/m);
});

test("AC-163-4: WHEN a package.json changes only its eslintConfig or prettier key THEN decide fails", () => {
  const cases = { eslintConfig: { rules: { "no-console": "off" } }, prettier: { printWidth: 200 }, jest: { bail: true }, knip: { ignore: ["src"] },
    jscpd: { threshold: 9 }, "lint-staged": { "*.ts": "eslint" } };
  for (const [key, value] of Object.entries(cases)) {
    const r = recommended({ "package.json": { base: json(PKG), head: json({ ...PKG, [key]: value }) } });
    assert.equal(r.pass, false, key);
    assert.ok(r.why.includes(`package.json (${key})`), `${key}: ${r.why}`);
  }
  const both = recommended({ "package.json": { base: json({ ...PKG, prettier: { semi: false } }), head: json({ ...WEAKER }) } });
  assert.ok(both.why.includes("package.json (scripts, prettier)"), `a removed key counts, and both names are listed: ${both.why}`);
});

test("#163: a package.json that is new or deleted counts as changed from empty; one with only dependencies doesn't", () => {
  assert.equal(recommended({ "web/package.json": { base: null, head: json(PKG) } }).pass, false, "a new package.json with scripts");
  assert.equal(recommended({ "web/package.json": { base: json(PKG), head: null } }).pass, false, "a deleted package.json with scripts");
  assert.equal(recommended({ "web/package.json": { head: json({ dependencies: { a: "1.0.0" } }) } }).pass, true, "a new one with only dependencies");
});

test("#163: on Full a writer's pass at the head passes a scripts change, and a fail refuses it", () => {
  const go = (comments) => decide({ changed: ["package.json"], packages: { "package.json": { base: json(PKG), head: json(WEAKER) } }, stack: FULL, comments,
    head: HEAD, trusted: new Set(["owner"]) });
  const say = (verdict) => ({ body: `Weakening review: ${verdict} @ ${HEAD}`, user: { login: "owner" } });
  assert.equal(go([]).pass, false);
  assert.equal(go([say("pass")]).pass, true);
  assert.equal(go([say("fail")]).pass, false);
});

test("AC-163-5: WHEN a changed package.json can't be read at one side, or isn't valid JSON THEN the guard fails and names the file and the reason", () => {
  const unread = recommended({ "package.json": { base: { error: "HTTP 502: bad gateway" }, head: json(PKG) } });
  assert.equal(unread.pass, false);
  assert.match(unread.why, /^package\.json \(couldn't read the base: HTTP 502: bad gateway\)$/m);
  const broken = recommended({ "apps/web/package.json": { base: json(PKG), head: "{ \"scripts\": " } });
  assert.equal(broken.pass, false);
  assert.match(broken.why, /^apps\/web\/package\.json \(the head isn't valid JSON: .+\)$/m);
  const notObject = recommended({ "package.json": { base: json(PKG), head: "null" } });
  assert.equal(notObject.pass, false);
  assert.match(notObject.why, /package\.json \(the head isn't a JSON object\)/);
  const none = decide({ changed: ["package.json"], stack: RECOMMENDED });
  assert.equal(none.pass, false, "a changed package.json the guard was given no text for fails");
  assert.match(none.why, /package\.json \(couldn't read the base: no text\)/);
});

// The gate from the session: the pull request's file list, the merge base from the compare API, and each side read
// through the contents API at that commit.
const P = "repos/acme/app";
const at = (path, ref) => `${P}/contents/${path}?ref=${ref}`;
const content = (text, path = "package.json") => ({ type: "file", encoding: "base64", path, content: Buffer.from(text).toString("base64") });
function gate({ files = [{ filename: "package.json", status: "modified" }], base = json(PKG), head = json(WEAKER), stack = RECOMMENDED, api = {} } = {}) {
  const dir = tmp("onrails-gate-pkg-");
  const path = files[0].filename;
  const fake = fakeGh(dir, {
    [`${P}/pulls/7`]: { head: { sha: HEAD }, base: { sha: "e".repeat(40), ref: "main" }, changed_files: files.length },
    [`${P}/pulls/7/files`]: files,
    [`${P}/issues/7/comments`]: [],
    [`${P}/issues/7/labels`]: [],
    [`${P}/contents/docs/stack.md`]: content(stack, "docs/stack.md"),
    [`${P}/compare/main...${HEAD}`]: { merge_base_commit: { sha: MERGE_BASE } },
    [at(path, MERGE_BASE)]: content(base, path),
    [at(path, HEAD)]: content(head, path),
    ...api,
  });
  const r = spawnSync(process.execPath, [SCRIPT, "gate", "7", "--repo", "acme/app", "--head", HEAD], { cwd: dir, encoding: "utf8", env: fake.env });
  return { ...r, calls: fake.calls() };
}

test("AC-163-6: WHEN gate runs with the fake gh on a pull request that changes package.json scripts THEN it reads the file at the merge base and at the head, and exits 1", unixOnly, () => {
  const r = gate();
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /package\.json \(scripts\)/);
  assert.match(r.calls, new RegExp(`compare/main\\.\\.\\.${HEAD}`));
  assert.ok(r.calls.includes(at("package.json", MERGE_BASE)), r.calls);
  assert.ok(r.calls.includes(at("package.json", HEAD)), r.calls);
  const bump = gate({ head: json(BUMPED) });
  assert.equal(bump.status, 0, `a dependency bump passes the gate: ${bump.stderr}`);
});

test("#163: gate fails closed when a side can't be read, or isn't where the file list says, and names the file and why", unixOnly, () => {
  const refused = gate({ api: { [at("package.json", HEAD)]: { ghError: "gh: Server Error (HTTP 500)" } } });
  assert.equal(refused.status, 1, refused.stdout);
  assert.match(refused.stderr, /package\.json \(couldn't read the head: .*HTTP 500/);
  const gone = gate({ head: json(BUMPED), api: { [at("package.json", MERGE_BASE)]: { ghError: "gh: Not Found (HTTP 404)" } } });
  assert.equal(gone.status, 1, `a modified file missing at the merge base is an error, not empty: ${gone.stdout}`);
  assert.match(gone.stderr, /package\.json \(couldn't read the base: .*not found.*\)/);
  const big = gate({ api: { [at("package.json", HEAD)]: { type: "file", encoding: "none", content: "" } } });
  assert.equal(big.status, 1, big.stdout);
  assert.match(big.stderr, /package\.json \(couldn't read the head: .+\)/);
  const noBase = gate({ api: { [`${P}/compare/main...${HEAD}`]: { ghError: "gh: Server Error (HTTP 502)" } } });
  assert.equal(noBase.status, 1, noBase.stdout);
  assert.match(noBase.stderr, /package\.json \(couldn't read the base: .*merge base.*HTTP 502/);
});

test("#163: gate: a renamed package.json is read under both names, and an added one passes with only dependencies", unixOnly, () => {
  const files = [{ filename: "apps/site/package.json", previous_filename: "apps/web/package.json", status: "renamed" }];
  const gone = { ghError: "gh: Not Found (HTTP 404)" };
  const moved = gate({ files, base: json(PKG), head: json(PKG), api: { [at("apps/site/package.json", MERGE_BASE)]: gone, [at("apps/web/package.json", HEAD)]: gone,
    [at("apps/web/package.json", MERGE_BASE)]: content(json(PKG), "apps/web/package.json"), [at("apps/site/package.json", HEAD)]: content(json(PKG), "apps/site/package.json") } });
  assert.equal(moved.status, 1, moved.stdout);
  assert.match(moved.stderr, /^apps\/web\/package\.json \(scripts\)$/m);
  assert.match(moved.stderr, /^apps\/site\/package\.json \(scripts\)$/m);
  const added = gate({ files: [{ filename: "package.json", status: "added" }], head: json({ dependencies: { a: "1.0.0" } }),
    api: { [at("package.json", MERGE_BASE)]: gone } });
  assert.equal(added.status, 0, added.stderr);
});

test("#163 round 1: gate fails closed when the contents API answers with another file's path (a symlink to a file in the repo)", unixOnly, () => {
  const linked = gate({ head: json(PKG), api: { [at("package.json", HEAD)]: content(json(PKG), "config/real-package.json") } });
  assert.equal(linked.status, 1, `same text, but not the file asked for: ${linked.stdout}`);
  assert.match(linked.stderr, /package\.json \(couldn't read the head: .*another file/);
  const ok = gate({ head: json(PKG) });
  assert.equal(ok.status, 0, `the same text from the file itself passes: ${ok.stderr}`);
});

test("#163 round 1: gate takes the merge base against the live base branch, not the base sha stored on the pull request", unixOnly, () => {
  const r = gate({ head: json(BUMPED) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.calls, new RegExp(`compare/main\\.\\.\\.${HEAD}`));
  assert.doesNotMatch(r.calls, /compare\/e{40}/);
});

test("#163: a pull request with no package.json reads no contents and no merge base", unixOnly, () => {
  const r = gate({ files: [{ filename: "src/app.ts", status: "modified" }] });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.calls, /compare\/|contents\/src/);
});

test("AC-163-7: full.md's weakening review protects package.json scripts and the inline config keys, and not a dependency bump", () => {
  const doc = read(".agents/skills/automation/references/full.md").split("## The weakening review")[1].split("\n1. ")[0];
  for (const name of ["`package.json`", "`scripts`", "`eslintConfig`", "`prettier`", "`jest`", "`knip`", "`jscpd`", "`lint-staged`"]) assert.ok(doc.includes(name), name);
  assert.match(doc, /dependency bump/);
});
