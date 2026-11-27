// The beta label (#125): on while the version is 0.x, gone from 1.0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readJson } from "../src/files.mjs";

const repo = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const { version } = readJson(repo("cli/package.json"));
const beta = version.startsWith("0.");
const MANIFESTS = ["plugin/.claude-plugin/plugin.json", "plugin/.codex-plugin/plugin.json"];
const BADGE = "[![Status: beta](https://img.shields.io/badge/status-beta-";
const LINE = "Early and actively changing. Expect rough edges, especially on first setup.";

test("the version is plain x.y.z: a prerelease tag would hide it from npx onrails", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

test("both plugin descriptions say (beta) exactly while the version is 0.x", () => {
  for (const file of MANIFESTS) assert.equal(readJson(repo(file)).description.startsWith("onRails (beta): "), beta, file);
});

test("the README opens with the beta badge and its line, before the first section, exactly while the version is 0.x", () => {
  const top = readFileSync(repo("README.md"), "utf8").split("\n## ")[0];
  assert.equal(top.includes(BADGE), beta, "AC-149-2: the badge");
  assert.equal(top.includes(LINE), beta, "AC-149-2: the line");
});

test("AC-149-1: the marketplace core entry and the Codex short description say (beta) exactly while 0.x", () => {
  const core = readJson(repo(".claude-plugin/marketplace.json")).plugins.find((p) => p.name === "core");
  assert.equal(core.description.startsWith("(beta) "), beta);
  const codex = readJson(repo("plugin/.codex-plugin/plugin.json")).interface.shortDescription;
  assert.equal(codex.startsWith("(beta) "), beta);
});

test("AC-149-3, AC-149-4: the README says what the grill does on each level and names npx onrails update", () => {
  const readme = readFileSync(repo("README.md"), "utf8");
  assert.ok(!readme.includes("the grill still shows each pick for you to confirm"));
  assert.match(readme, /below Full, the grill shows each pick for you to confirm\. On Full, nothing waits/);
  assert.ok(readme.includes("`npx onrails update` keeps your edits"));
  assert.ok(!readme.includes("today you edit those files in your project. `update` keeps"));
});

test("AC-149-5: the profile template says the [routing] model names are notes", () => {
  const toml = readFileSync(repo(".agents/skills/idea/templates/profile.toml"), "utf8");
  assert.match(toml.split("[routing]")[1].split("\n[")[0], /notes for you and the agent: no skill reads them by name/);
});
