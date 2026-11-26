// #132 (part of #98, no GitHub Actions): the stack packs and templates ship no workflows, new repos
// record ci = "local", their previews and deploys are package scripts, and setup-github requires no
// Actions check. A fake `gh` on PATH logs every call setup-github makes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmp } from "./helpers.mjs";

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

const FAKE_GH = `#!/usr/bin/env node
const fs = require("fs");
const argv = process.argv.slice(2);
let stdin = "";
try { stdin = fs.readFileSync(0, "utf8"); } catch {}
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ argv, stdin }) + "\\n");
const say = (text) => { process.stdout.write(text); process.exit(0); };
if (argv[0] === "api" && argv[1] === "user") say(JSON.stringify({ login: "me", id: 1 }));
if (argv[0] === "api" && argv.includes("--jq")) say("private\\n");
if (argv[0] === "api" && argv.some((a) => a.endsWith("/rulesets"))) say("[]");
`;

// The fake gh is a shebang script, which Windows can't run.
test("AC-132-3: setup-github's rule on main requires only onrails/check, and it never looks for a workflow", { skip: process.platform === "win32" }, () => {
  const dir = tmp("onrails-rules-");
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "gh"), FAKE_GH);
  chmodSync(join(dir, "bin", "gh"), 0o755);
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/acme/app.git"]);
  const r = spawnSync(process.execPath, [join(REPO, ".agents/skills/name/scripts/setup-github.mjs"), "--plan", "team"], {
    cwd: dir,
    encoding: "utf8",
    input: "",
    env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, FAKE_LOG: join(dir, "calls.jsonl"), HOME: dir },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const calls = readFileSync(join(dir, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const post = calls.find((c) => c.argv.includes("POST") && c.argv.some((a) => a.endsWith("/rulesets")));
  assert.ok(post, "created the rule on main");
  const rules = JSON.parse(post.stdin).rules;
  const checks = rules.find((x) => x.type === "required_status_checks").parameters.required_status_checks;
  assert.deepEqual(checks, [{ context: "onrails/check" }]);
  assert.deepEqual(calls.filter((c) => c.argv.join(" ").includes(".github/workflows")), []);
  assert.match(r.stdout, /done\s+rules on main/);
});
