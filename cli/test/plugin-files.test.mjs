// The plugin's manifests, checked without Claude Code or Codex (CI has neither signed in).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readJson } from "../src/files.mjs";

const repo = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const { version } = readJson(repo("cli/package.json"));

test("both plugin manifests are named or and carry the CLI's version", () => {
  for (const file of ["plugin/.claude-plugin/plugin.json", "plugin/.codex-plugin/plugin.json"]) {
    const m = readJson(repo(file));
    assert.equal(m.name, "or", file);
    assert.equal(m.version, version, file);
    assert.equal(m.license, "MIT", file);
  }
});

test("the Claude Code marketplace is onrails with one entry, core, from ./plugin", () => {
  const m = readJson(repo(".claude-plugin/marketplace.json"));
  assert.equal(m.name, "onrails");
  assert.ok(m.owner?.name);
  assert.deepEqual(m.plugins.map((p) => [p.name, p.source]), [["core", "./plugin"]]);
});

test("the Codex marketplace names its entry or, because Codex needs it to match plugin.json", () => {
  const m = readJson(repo(".agents/plugins/marketplace.json"));
  assert.equal(m.name, "onrails");
  assert.deepEqual(m.plugins.map((p) => [p.name, p.source.path]), [["or", "./plugin"]]);
});

test("the plugin ships the four entry skills, update (#178) and a CLI that can run init", () => {
  assert.deepEqual(readdirSync(repo("plugin/skills")).sort(), ["afk", "back", "idea", "join", "update"]);
  assert.ok(existsSync(repo("plugin/cli/bin/cli.mjs")));
  assert.equal(readJson(repo("plugin/cli/kit/manifest.json")).kitVersion, version);
});

test("the plugin's CLI ships NOTICE next to LICENSE, the same as the repo's", () => {
  assert.equal(readFileSync(repo("plugin/cli/NOTICE"), "utf8"), readFileSync(repo("NOTICE"), "utf8"));
  assert.ok(existsSync(repo("plugin/cli/LICENSE")));
});
