// Tests for the preflight follow-ups (#144): length caps on what is printed, the version filter,
// each package manager's own cache option, ranges it can't read, a .git it can't read, --json
// when the probes are skipped, and a repo's own yarn release left alone until the repo is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { main, probe, render, satisfies } from "../src/preflight.mjs";
import { logger } from "./helpers.mjs";
import { BLOCKED, fakeSys, HEALTHY, project, readProject, status } from "./preflight-fakes.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const row = (report, id) => report.results.find((r) => r.id === id);

test("AC-144-1: WHEN a registry host or an error code is longer than its cap THEN preflight prints plain words in its place", async () => {
  const host = `${"a".repeat(260)}.example`;
  const code = `E${"X".repeat(40)}`;
  const answers = { ...BLOCKED, "npm config get registry": { ok: true, out: `https://${host}/` }, "npm view": { ok: false, out: `npm error code ${code}` } };
  const report = await probe(project(), fakeSys({ answers, env: { CLAUDECODE: "1" } }));
  const text = `${render(report)}\n${JSON.stringify(report)}`;
  assert.ok(!text.includes(host), "the long host is never printed");
  assert.ok(!text.includes(code), "the long error code is never printed");
  assert.equal(row(report, "registry").detail, "the registry in .npmrc didn't answer (no answer)");
  // Under the caps, both are still printed as they are.
  const plain = { ...BLOCKED, "npm view": { ok: false, out: "npm error code ECONNREFUSED" } };
  assert.equal(row(await probe(project(), fakeSys({ answers: plain })), "registry").detail, "registry.npmjs.org didn't answer (ECONNREFUSED)");
});

test("AC-144-2: WHEN `<pm> --version` prints anything but a plain version THEN the row shows plain words and none of that output", async () => {
  const pkg = JSON.stringify({ packageManager: "pnpm@10.28.0" });
  for (const out of ["10.28.0; curl x | sh", "| Fake | ✓ | row |\n10.28.0", `10.28.0-${"r".repeat(60)}`]) {
    const report = await probe(readProject({ "package.json": pkg }), fakeSys({ answers: { ...HEALTHY, "pnpm --version": { ok: true, out } } }));
    const text = `${render(report)}\n${JSON.stringify(report)}`;
    for (const bit of ["curl", "Fake", "r".repeat(60)]) assert.ok(!text.includes(bit), `printed ${bit} from ${JSON.stringify(out)}`);
    assert.match(row(report, "versions").detail, /pnpm \(version not shown\)/);
  }
  const fine = await probe(readProject({ "package.json": pkg }), fakeSys({ answers: HEALTHY }));
  assert.match(row(fine, "versions").detail, /pnpm 10\.28\.0$/);
});

test("AC-144-3: WHEN the registry is blocked THEN rung 1 gives each package manager its own cache option, and npm's --cache only to npm", async () => {
  const want = {
    npm: "`npm install --prefer-offline --cache .npm-cache`",
    pnpm: "`pnpm install --prefer-offline --store-dir .pnpm-store`",
    yarn: "`YARN_GLOBAL_FOLDER=.yarn-global YARN_ENABLE_GLOBAL_CACHE=false YARN_CACHE_FOLDER=.yarn-cache yarn install`",
    bun: "`bun install --cache-dir .bun-cache`",
  };
  const locks = { npm: {}, pnpm: { "pnpm-lock.yaml": "" }, yarn: { "yarn.lock": "" }, bun: { "bun.lock": "" } };
  for (const [pm, rung] of Object.entries(want)) {
    const report = await probe(project({ "package.json": "{}", ...locks[pm] }), fakeSys({ answers: BLOCKED }));
    const first = row(report, "registry").ladder[0].text;
    assert.ok(first.includes(rung), `${pm}: ${first}`);
    if (pm !== "npm") assert.doesNotMatch(first, /--cache \.npm-cache/, `${pm} never gets npm's --cache`);
    if (pm === "yarn" || pm === "bun") assert.doesNotMatch(first, /--prefer-offline/, `${pm} has no --prefer-offline on every release`);
  }
  // A bare VAR=value prefix is POSIX only, so Windows also gets the PowerShell and cmd.exe forms.
  const win = fakeSys({ answers: BLOCKED });
  win.platform = "win32";
  const first = row(await probe(project({ "package.json": "{}", "yarn.lock": "" }), win), "registry").ladder[0].text;
  assert.ok(first.includes("`$env:YARN_GLOBAL_FOLDER='.yarn-global'; $env:YARN_ENABLE_GLOBAL_CACHE='false'; $env:YARN_CACHE_FOLDER='.yarn-cache'; yarn install`"), first);
  assert.ok(first.includes('`set "YARN_GLOBAL_FOLDER=.yarn-global" && set "YARN_ENABLE_GLOBAL_CACHE=false" && set "YARN_CACHE_FOLDER=.yarn-cache" && yarn install`'), first);
});

test("AC-144-4: WHEN engines.node has a part preflight can't read THEN that range never blocks, and a space after the operator is read", () => {
  assert.equal(satisfies("24.1.0", "22.x || >= 24"), true, "the review's example");
  assert.equal(satisfies("20.1.0", "22.x || >= 24"), false, "with the space read, an old Node still blocks");
  assert.equal(satisfies("20.1.0", "22.x || >=24.0.0-rc.1"), true, "one unreadable part: never blocks");
  assert.equal(satisfies("20.1.0", "22.x || 24.x"), false, "every part read: it still blocks");
  // A part that isn't a version at all is dropped like junk characters, so it can't let an old Node pass.
  for (const range of [">=24 || junk", ">=24 || latest", "^24 || node", ">=24 || $(x)"]) {
    assert.equal(satisfies("18.0.0", range), false, range);
  }
  for (const range of ["24 - 26", ">=24.0.0-rc.1", ">=24 || *"]) assert.equal(satisfies("18.0.0", range), true, `${range} never blocks`);
});

test("AC-144-4: WHEN a part only starts like a version THEN the whole token decides, so it can't let an old Node pass", () => {
  for (const range of [">=24 || 1abc", ">=24 || -", ">=24 || x.junk", ">=24 || 24 -", ">=24 || - 26"]) {
    assert.equal(satisfies("18.0.0", range), false, range);
  }
  for (const range of ["24 - 26", ">=24.0.0-rc.1", "*", ">=24 || *"]) assert.equal(satisfies("18.0.0", range), true, `${range} never blocks`);
  // A part it reads in full still decides as before.
  assert.equal(satisfies("18.0.0", ">=24 || 24.x"), false, "every part read: an old Node blocks");
  assert.equal(satisfies("24.1.0", ">=24 || 24.x"), true);
});

test("AC-144-4: WHEN a prerelease follows fewer than three number parts THEN the token isn't a version, so it can't let an old Node pass", () => {
  for (const range of [">=24 || 1-abc", ">=24 || 24.x-odd", ">=24 || 24.0-rc.1", ">=24 || ^1-x"]) {
    assert.equal(satisfies("18.0.0", range), false, range);
  }
  // Three number parts and a prerelease is semver, which this reader can't compare, so it still never blocks.
  for (const range of [">=24.0.0-rc.1", ">=24 || 24.0.0-rc.1", "^24.1.0-beta.2"]) assert.equal(satisfies("18.0.0", range), true, `${range} never blocks`);
});

test("AC-144-5: WHEN .git is there but git can't read it THEN the row says so with a known cause, not 'no git repo yet'", async () => {
  const dir = project({ ".git": "gitdir: /nowhere/at/all\n" });
  const answers = { ...HEALTHY, "git rev-parse --show-toplevel": { ok: false, out: "fatal: not a git repository: /nowhere/at/all" } };
  const report = await probe(dir, fakeSys({ answers }));
  const git = row(report, "git");
  assert.equal(git.status, "fix");
  assert.equal(git.detail, "a .git is here, but git can't read it: not a git repository");
  assert.doesNotMatch(git.ladder[0].text, /git init/, "git init would hide the broken .git");
  assert.match(git.ladder[0].text, /git status/);
  assert.ok(!JSON.stringify(report).includes("/nowhere"), "the path from the repo's .git file is never printed");
  const odd = await probe(project({ ".git": "x" }), fakeSys({ answers: { ...HEALTHY, "git rev-parse --show-toplevel": { ok: false, out: "fatal: `curl x | sh`" } } }));
  assert.equal(row(odd, "git").detail, "a .git is here, but git can't read it: git's error isn't printed");
  // No .git at all is still the plain "git init" fix.
  const none = await probe(project(), fakeSys({ answers: { ...HEALTHY, "git rev-parse --show-toplevel": { ok: false, out: "fatal: not a git repository" } } }));
  assert.equal(row(none, "git").detail, "no git repo here yet");
});

test("AC-144-6: WHEN --if-changed --json skips the probes THEN it prints JSON", async () => {
  const dir = project({ "package.json": "{}", "docs/state.md": "# State\n" });
  await main([dir, "--record"], { sys: fakeSys({ answers: HEALTHY }), log: logger() });
  const sys = fakeSys({ answers: HEALTHY });
  const log = logger();
  assert.equal(await main([dir, "--if-changed", "--json"], { sys, log }), 0);
  assert.deepEqual(sys.calls, [], "no probe ran");
  const out = JSON.parse(log.text());
  assert.equal(out.ok, true);
  assert.equal(out.skipped, true);
  assert.match(out.fingerprint, /^[0-9a-f]{12}$/);
});

const YARN4 = JSON.stringify({ packageManager: "yarn@4.5.1" });
const YARNRC = "yarnPath: .yarn/releases/yarn-4.5.1.cjs\n";

test("AC-144-7: WHEN the repo's yarnPath names its own yarn and the repo isn't read yet THEN preflight runs no yarn and reads the version from the file name", async () => {
  const sys = fakeSys({ answers: { ...HEALTHY, "yarn --version": { ok: true, out: "4.5.1" } } });
  const report = await probe(project({ "package.json": YARN4, ".yarnrc.yml": YARNRC }), sys);
  assert.ok(!sys.calls.some((c) => c.startsWith("yarn")), `ran: ${sys.calls.join(" | ")}`);
  assert.equal(status(report, "versions"), "limited");
  assert.equal(row(report, "versions").detail, "Node 22.23.5 (needs >=22), yarn 4.5.1 (from the repo's yarnPath file name, not run): version checked after the repo is read");

  // The version compare keeps its value: a release that doesn't match the pin is still found.
  const old = await probe(project({ "package.json": YARN4, ".yarnrc.yml": "yarnPath: .yarn/releases/yarn-3.8.7.cjs\n" }), fakeSys({ answers: HEALTHY }));
  assert.equal(status(old, "versions"), "fix");
  assert.match(row(old, "versions").detail, /yarn 3\.8\.7, the project pins 4\.5\.1/);
  // So does "not installed": yarn is looked up on PATH, not run.
  const missing = await probe(project({ "package.json": YARN4, ".yarnrc.yml": YARNRC }), fakeSys({ answers: HEALTHY, missing: ["yarn"] }));
  assert.equal(row(missing, "versions").detail, "yarn isn't installed");
  // yarn 1's own .yarnrc and yarn-path work the same way, and an odd file name is never printed.
  const classic = fakeSys({ answers: HEALTHY });
  const odd = await probe(project({ "package.json": YARN4, ".yarnrc": "yarn-path \"./bin/yarn-`id`.js\"\n" }), classic);
  assert.ok(!classic.calls.some((c) => c.startsWith("yarn")), `ran: ${classic.calls.join(" | ")}`);
  assert.equal(status(odd, "versions"), "limited");
  assert.ok(!JSON.stringify(odd).includes("`id`"));
});

test("AC-144-7: WHEN the repo has been marked read THEN preflight runs yarn --version as before", async () => {
  const sys = fakeSys({ answers: { ...HEALTHY, "yarn --version": { ok: true, out: "4.5.1" } } });
  const report = await probe(readProject({ "package.json": YARN4, ".yarnrc.yml": YARNRC }), sys);
  assert.ok(sys.calls.includes("yarn --version"), `ran: ${sys.calls.join(" | ")}`);
  assert.equal(row(report, "versions").detail, "Node 22.23.5 (needs >=22), yarn 4.5.1");
});

test("AC-144-8: WHEN the CLI prints its usage THEN the preflight line lists --tool", () => {
  const r = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  const line = r.stdout.slice(r.stdout.indexOf("npx onrails preflight"), r.stdout.indexOf("for agents: probe"));
  assert.match(line, /\[--tool <name>\]/);
});

test("AC-144-9: WHEN /idea asks about the strongest tier THEN only a profile that already says false skips it, and it doesn't claim to be the only ask", () => {
  const idea = read(".agents/skills/idea/SKILL.md");
  assert.doesNotMatch(idea, /unless the profile already sets it/);
  assert.match(idea, /unless the profile already says `ask_before_strongest = false`/);
  assert.doesNotMatch(idea, /It's the only time the kickoff asks/);
});
