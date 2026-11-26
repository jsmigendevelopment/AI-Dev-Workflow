// #132 (part of #98, no GitHub Actions): the stack packs and templates ship no workflows, new repos
// record ci = "local", their previews and deploys are package scripts, and setup-github requires no
// Actions check. A fake `gh` on PATH logs every call setup-github makes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(REPO, path), "utf8");

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [relative(REPO, path).split("\\").join("/")];
  });
}

const WORKFLOW = /(^|\/)\.github\/workflows\//;

test("AC-132-1: no stack pack, add-on or template in the repo has a .github/workflows/ file", () => {
  const shipped = ["stacks", "templates", ".agents/skills/idea/templates"].flatMap((dir) => files(join(REPO, dir)));
  assert.ok(shipped.length > 100, "found the packs");
  assert.deepEqual(shipped.filter((p) => WORKFLOW.test(p)), []);
  // A workflow template under another name: a YAML file with jobs that run on a runner.
  const yaml = shipped.filter((p) => /\.ya?ml$/.test(p) && /^\s*jobs:\s*$/m.test(read(p)) && /runs-on:/.test(read(p)));
  assert.deepEqual(yaml, []);
});

test("AC-132-1: the built kit (cli/kit and plugin/cli/kit) carries no workflow in a pack, add-on or template", () => {
  const manifests = ["cli/kit/manifest.json", "plugin/cli/kit/manifest.json"].filter((p) => existsSync(join(REPO, p)));
  assert.ok(manifests.includes("plugin/cli/kit/manifest.json"), "plugin/cli/kit is checked in");
  for (const path of manifests) {
    const { packs = {}, addons = {}, templates = {} } = JSON.parse(read(path));
    const listed = [
      ...Object.values(packs).flatMap((p) => Object.keys(p.files)),
      ...Object.values(addons).flatMap((a) => Object.values(a).flatMap((x) => Object.keys(x.files))),
      ...Object.values(templates).flatMap((t) => Object.keys(t)),
    ];
    assert.deepEqual(listed.filter((p) => WORKFLOW.test(p)), [], path);
  }
  assert.deepEqual(files(join(REPO, "plugin/cli/kit/files/templates")).filter((p) => WORKFLOW.test(p)), []);
});

test("AC-132-2: a new repo's docs/stack.md says ci = \"local\", and the TanStack pack previews and deploys from package scripts", () => {
  assert.match(read(".agents/skills/idea/templates/stack.md"), /^ci = "local"$/m);
  for (const skill of ["stack", "stack-tanstack-start", "stack-monorepo-expo", "name"]) {
    assert.match(read(`.agents/skills/${skill}/SKILL.md`), /ci = "local"/, skill);
  }
  const { scripts } = JSON.parse(read("stacks/tanstack-start/package.json"));
  assert.equal(scripts["deploy:preview"], "node scripts/deploy.ts preview");
  assert.equal(scripts["deploy:test"], "node scripts/deploy.ts test");
  assert.equal(scripts["deploy:production"], "node scripts/deploy.ts production");
  for (const file of ["scripts/deploy.ts", "scripts/deploy/preview.ts", "scripts/deploy/test-site.ts", "scripts/deploy/production.ts", "scripts/deploy/deploy.test.ts"]) {
    assert.ok(existsSync(join(REPO, "stacks/tanstack-start", file)), file);
  }
  const mono = JSON.parse(read("stacks/monorepo-expo/package.json")).scripts;
  for (const name of ["deploy:preview", "deploy:test", "deploy:production", "check:merge", "pr:rules"]) {
    assert.equal(mono[name], `pnpm -C apps/web ${name}`, name);
  }
});

test("#132: stack, name and both pack skills never set up, wait on or require a workflow", () => {
  const OLD = /\b(ci|preview|deploy-test|deploy-production|pr-rules|dependabot-auto-merge|visual-baselines|agent-files)\.yml\b|gh workflow run|e2e:mobile` label|Allow auto-merge/;
  for (const path of [".agents/skills/stack/SKILL.md", ".agents/skills/name/SKILL.md", ".agents/skills/stack-tanstack-start/SKILL.md",
    ".agents/skills/stack-monorepo-expo/SKILL.md", ".agents/skills/pyramid/SKILL.md", "stacks/tanstack-start/README.md", "stacks/monorepo-expo/README.md"]) {
    assert.doesNotMatch(read(path), OLD, path);
  }
});

// A fake gh: it logs every call. FAKE_STATUS=refuse makes it refuse commit statuses the way a
// proxy can (HTTP 403). FAKE_RULESETS and FAKE_RULESET are the rulesets GitHub already has.
const FAKE_GH = `#!/usr/bin/env node
const fs = require("fs");
const argv = process.argv.slice(2);
let stdin = "";
try { stdin = fs.readFileSync(0, "utf8"); } catch { /* no stdin to read (closed, or a terminal that would block): the call had no input */ }
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ argv, stdin }) + "\\n");
const say = (text) => { process.stdout.write(text); process.exit(0); };
const path = argv.find((a) => a.startsWith("repos/")) || "";
if (argv[0] === "api" && argv[1] === "user") say(JSON.stringify({ login: "me", id: 1 }));
if (path.endsWith("/commits/HEAD")) say("abc123\\n");
if (path.includes("/statuses/") && process.env.FAKE_STATUS === "refuse") {
  process.stderr.write("gh: Write access to this GitHub API path is not permitted through this proxy (HTTP 403)\\n");
  process.exit(1);
}
if (argv[0] === "api" && argv.includes("--jq")) say("private\\n");
if (path.endsWith("/rulesets") && !argv.includes("POST")) say(process.env.FAKE_RULESETS || "[]");
if (/\\/rulesets\\/\\d+$/.test(path) && !argv.includes("PUT")) say(process.env.FAKE_RULESET || "{}");
`;

/** Runs setup-github on the team plan against the fake gh, and returns its output and calls. */
function setupGithub(env = {}, extra = []) {
  const dir = tmp("onrails-rules-");
  // Outside the repo, as an installed gh is: setup-github never starts a gh from a folder inside the repo (#238).
  const bin = tmp("onrails-fake-bin-");
  writeFileSync(join(bin, "gh"), FAKE_GH);
  chmodSync(join(bin, "gh"), 0o755);
  execFileSync("git", ["init", "-q", dir], { env: safeEnv() });
  execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/acme/app.git"], { env: safeEnv() });
  const r = spawnSync(process.execPath, [join(REPO, ".agents/skills/name/scripts/setup-github.mjs"), "--plan", "team", ...extra], {
    cwd: dir,
    encoding: "utf8",
    input: "",
    env: safeEnv({ FAKE_LOG: join(dir, "calls.jsonl"), HOME: dir, ...env }, { bins: [bin] }),
  });
  const calls = readFileSync(join(dir, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { r, calls };
}
const writesTo = (calls, method, pattern) => calls.filter((c) => c.argv.includes(method) && c.argv.some((a) => pattern.test(a)));
const statusRules = (rules) => rules.filter((x) => x.type === "required_status_checks");

// The fake gh is a shebang script, which Windows can't run.
const UNIX = { skip: process.platform === "win32" };

test("AC-132-3: setup-github's rule on main requires only onrails/check, after a probe status posts, and it never looks for a workflow", UNIX, () => {
  const { r, calls } = setupGithub();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [probe] = writesTo(calls, "POST", /\/statuses\/abc123$/);
  assert.ok(probe, "posted a probe status on the default branch's head");
  assert.equal(JSON.parse(probe.stdin).context, "onrails/setup-probe");
  const [post] = writesTo(calls, "POST", /\/rulesets$/);
  assert.ok(post, "created the rule on main");
  assert.ok(calls.indexOf(probe) < calls.indexOf(post), "probed first");
  const [checks] = statusRules(JSON.parse(post.stdin).rules);
  assert.deepEqual(checks.parameters.required_status_checks, [{ context: "onrails/check" }]);
  assert.deepEqual(calls.filter((c) => c.argv.join(" ").includes(".github/workflows")), []);
  assert.match(r.stdout, /done\s+rules on main\s+.*requires onrails\/check/);
});

test("AC-132-3: when GitHub refuses the probe status, the new rule on main requires no status, and says why", UNIX, () => {
  const { r, calls } = setupGithub({ FAKE_STATUS: "refuse" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [post] = writesTo(calls, "POST", /\/rulesets$/);
  const rules = JSON.parse(post.stdin).rules;
  assert.deepEqual(statusRules(rules), [], "no required status");
  assert.deepEqual(rules.map((x) => x.type), ["deletion", "non_fast_forward", "pull_request"], "the other rules stay");
  assert.match(r.stdout, /done\s+rules on main\s+.*requires no status: GitHub refused a probe commit status here \(gh: Write access .*HTTP 403\)/);
});

test("#132: an existing rule is never left requiring a status nothing can post", UNIX, () => {
  const ruleset = (checks) => JSON.stringify({ name: "protect-main", target: "branch", enforcement: "active", conditions: {}, bypass_actors: [],
    rules: [{ type: "deletion" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: checks } }] });
  const refused = { FAKE_STATUS: "refuse", FAKE_RULESETS: JSON.stringify([{ id: 7, name: "protect-main" }]) };

  const kitOnly = setupGithub({ ...refused, FAKE_RULESET: ruleset([{ context: "onrails/check" }, { context: "checks" }]) });
  assert.equal(kitOnly.r.status, 0, kitOnly.r.stdout + kitOnly.r.stderr);
  const [put] = writesTo(kitOnly.calls, "PUT", /\/rulesets\/7$/);
  assert.deepEqual(JSON.parse(put.stdin).rules, [{ type: "deletion" }], "the status rule goes when nothing is left in it");
  assert.match(kitOnly.r.stdout, /updated, and requires no status/);

  const other = setupGithub({ ...refused, FAKE_RULESET: ruleset([{ context: "onrails/check" }, { context: "vercel", integration_id: 8 }]) });
  const [kept] = writesTo(other.calls, "PUT", /\/rulesets\/7$/);
  const [checks] = statusRules(JSON.parse(kept.stdin).rules);
  assert.deepEqual(checks.parameters.required_status_checks, [{ context: "vercel", integration_id: 8 }], "keeps a check the kit didn't add");

  const ok = setupGithub({ FAKE_RULESETS: refused.FAKE_RULESETS, FAKE_RULESET: ruleset([{ context: "checks" }]) });
  const [swapped] = writesTo(ok.calls, "PUT", /\/rulesets\/7$/);
  assert.deepEqual(statusRules(JSON.parse(swapped.stdin).rules)[0].parameters.required_status_checks, [{ context: "onrails/check" }]);
});

test("#132: setup-github's dry run says it will probe, and posts no probe status", UNIX, () => {
  const { r, calls } = setupGithub({}, ["--dry-run"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(calls.filter((c) => c.argv.some((a) => a.includes("/statuses/") || a.includes("/rulesets"))), []);
  assert.match(r.stdout, /would do\s+rules on main\s+.*posts a probe status first, and requires onrails\/check only if it posts/);
});
