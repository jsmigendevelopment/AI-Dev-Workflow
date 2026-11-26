// #133 (part of #98, no GitHub Actions): doctor and preflight warn when a repo on ci = "local" still has workflow
// files or Actions on, and print the one command that fixes both. The agent-file guard already flags a new workflow.
// Fakes only: doctor gets fakeSystem, preflight its fake session. Nothing reaches GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../../.agents/skills/coordinate/scripts/agent-files.mjs";
import { doctor } from "../src/doctor.mjs";
import { main, probe, render } from "../src/preflight.mjs";
import { fakeSys, HEALTHY, project, readProject } from "./preflight-fakes.mjs";
import { fakeSystem, logger, put, tmp } from "./helpers.mjs";

const REMOTE = { ok: true, out: "https://github.com/acme/app.git", all: "https://github.com/acme/app.git" };
const ON = JSON.stringify({ enabled: true, allowed_actions: "all" });
const OFF = JSON.stringify({ enabled: false });
const PERMS = "gh api repos/acme/app/actions/permissions";
const answer = (json) => ({ ok: true, out: json, all: json });

function doctorText(dir, probes = {}) {
  const log = logger();
  doctor(dir, { log, sys: fakeSystem({ commands: ["git", "gh"], probes: { "git remote get-url origin": REMOTE, ...probes } }) });
  return log.text();
}

test("AC-133-2: WHEN `onrails doctor` runs in a repo with workflow files THEN it warns and prints `npx onrails ci local`", () => {
  const dir = tmp();
  put(dir, ".github/workflows/ci.yml", "on: push\n");
  const text = doctorText(dir, { [PERMS]: answer(OFF) });
  assert.match(text, /✗ 1 workflow file\(s\) in \.github\/workflows\/ on ci = "local": \.github\/workflows\/ci\.yml/);
  assert.match(text, /fix: Run: npx onrails ci local/);
});

test("#133: doctor warns when Actions is still on, says so when all is clear, and stays quiet on ci = \"actions\"", () => {
  const dir = tmp();
  const on = doctorText(dir, { [PERMS]: answer(ON) });
  assert.match(on, /✗ GitHub Actions is on for acme\/app \(ci = "local"\)/);
  assert.match(on, /fix: Run: npx onrails ci local/);
  assert.match(doctorText(dir, { [PERMS]: answer(OFF) }), /✓ No GitHub Actions: no workflow files, and Actions is off for acme\/app/);
  assert.match(doctorText(dir, { [PERMS]: { ok: false, out: "HTTP 403", all: "HTTP 403" } }), /– GitHub Actions setting for acme\/app not checked/);

  put(dir, ".github/workflows/ci.yml", "on: push\n");
  put(dir, "docs/stack.md", '# Stack\n\nci = "actions"\n');
  const actions = doctorText(dir, { [PERMS]: answer(ON) });
  assert.doesNotMatch(actions, /workflow file|GitHub Actions is on|onrails ci local/);
});

test("#133: preflight warns under its table about workflow files, before the read too, and runs nothing for it then", async () => {
  const dir = project({ "package.json": "{}", ".github/workflows/ci.yml": "on: push\n" });
  const sys = fakeSys({ answers: { ...HEALTHY, [PERMS]: { ok: true, out: ON } } });
  const report = await probe(dir, sys);
  assert.equal(report.read, false);
  assert.deepEqual(report.warnings, ['1 workflow file(s) in .github/workflows/, on ci = "local". Fix: `npx onrails ci local` removes them in a pull request and turns Actions off.']);
  assert.equal(sys.calls.filter((c) => c.includes("actions/permissions")).length, 0, "GitHub is asked only after the read");
  assert.equal(report.ok, true, "a warning doesn't fail preflight");
  const text = render(report);
  assert.match(text, /^Warning: 1 workflow file\(s\) in \.github\/workflows\/.*npx onrails ci local/m);
  assert.match(text, /Environment: ok\./);
});

test("#133: after the read, preflight also warns when Actions is on, asking GitHub from the repo", async () => {
  const dir = readProject({ "package.json": "{}" });
  const sys = fakeSys({ answers: { ...HEALTHY, [PERMS]: { ok: true, out: ON } } });
  const report = await probe(dir, sys);
  assert.deepEqual(report.warnings, ['GitHub Actions is on for acme/app, on ci = "local". Fix: `npx onrails ci local` turns it off.']);
  assert.equal(sys.runs.find((r) => r.line === PERMS).cwd, dir);
  const off = fakeSys({ answers: { ...HEALTHY, [PERMS]: { ok: true, out: OFF } } });
  assert.deepEqual((await probe(dir, off)).warnings, []);
  put(dir, "docs/stack.md", 'ci = "actions"\n');
  assert.deepEqual((await probe(dir, sys)).warnings, [], "ci = \"actions\" is the person's own choice");
});

test("#133: preflight --if-changed still warns about workflow files when it skips the probes, and runs nothing", async () => {
  const dir = project({ "package.json": "{}", "docs/state.md": "# State\n" });
  const first = logger();
  await main([dir, "--record"], { sys: fakeSys({ answers: HEALTHY }), log: first });
  put(dir, ".github/workflows/ci.yml", "on: push\n");
  const sys = fakeSys({ answers: HEALTHY });
  const log = logger();
  assert.equal(await main([dir, "--if-changed"], { sys, log }), 0);
  assert.match(log.text(), /Skipped the probes/);
  assert.match(log.text(), /^Warning: 1 workflow file\(s\).*npx onrails ci local/m);
  assert.deepEqual(sys.calls, []);
});

test("AC-133-3: WHEN a pull request adds a file under .github/workflows/ THEN agent-files.mjs flags it", () => {
  const stack = "- **Level:** recommended\n";
  for (const path of [".github/workflows/new.yml", ".github/workflows/deploy.yaml", ".github/workflows/nested/x.yml"]) {
    const r = decide({ changed: [path, "src/app.ts"], stack });
    assert.equal(r.pass, false, path);
    assert.match(r.why, new RegExp(path.replaceAll(".", "\\.")));
  }
  const full = decide({ changed: [".github/workflows/new.yml"], stack: "- **Level:** full\n", labels: ["human-approved"] });
  assert.equal(full.pass, false, "on Full, only the weakening review passes it");
});
