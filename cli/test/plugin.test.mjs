import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.mjs";
import { pluginChecks } from "../src/plugin.mjs";
import { init } from "../src/init.mjs";
import { fakeSystem, logger, put, tmp } from "./helpers.mjs";

const claudeRecord = (version) => JSON.stringify({ version: 2, plugins: { "core@onrails": [{ scope: "user", installPath: "/x", version }] } });
const labels = (checks) => checks.map((c) => `${c.status} ${c.label}`).join("\n");

test("doctor says the plugin is not installed, as info only", () => {
  const checks = pluginChecks({ home: tmp(), kitVersion: "0.4.0" });
  assert.equal(checks.length, 1);
  assert.match(labels(checks), /^– onRails plugin not installed/);
});

test("doctor finds the Claude Code plugin under ~/.claude/plugins and compares versions", () => {
  const home = tmp();
  put(home, ".claude/plugins/installed_plugins.json", claudeRecord("0.4.0"));
  assert.match(labels(pluginChecks({ home, kitVersion: "0.4.0" })), /✓ Claude Code plugin core@onrails v0\.4\.0 matches the kit/);
  const old = pluginChecks({ home, kitVersion: "0.5.0" });
  assert.match(labels(old), /✗ Claude Code plugin core@onrails is v0\.4\.0, the kit here is v0\.5\.0/);
  assert.equal(old[0].required, false);
  assert.match(old[0].fix, /claude plugin update core@onrails/);
});

test("doctor honours CLAUDE_CONFIG_DIR and CLAUDE_CODE_PLUGIN_CACHE_DIR", () => {
  const config = tmp(), cache = tmp();
  put(config, "plugins/installed_plugins.json", claudeRecord("0.3.0"));
  put(cache, "installed_plugins.json", claudeRecord("0.4.0"));
  assert.match(labels(pluginChecks({ home: tmp(), env: { CLAUDE_CONFIG_DIR: config }, kitVersion: "0.4.0" })), /is v0\.3\.0/);
  assert.match(labels(pluginChecks({ home: tmp(), env: { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_PLUGIN_CACHE_DIR: cache }, kitVersion: "0.4.0" })), /✓ .* v0\.4\.0/);
});

test("doctor finds the Codex plugin in its cache, and ignores an unreadable Claude record", () => {
  const home = tmp();
  put(home, ".codex/plugins/cache/onrails/or/0.4.0/skills/idea/SKILL.md", "x");
  put(home, ".claude/plugins/installed_plugins.json", "{ not json");
  assert.equal(labels(pluginChecks({ home, kitVersion: "0.4.0" })), "✓ Codex plugin or@onrails v0.4.0 matches the kit");
});

test("doctor compares the plugin with the project's kit version, not the CLI's", () => {
  const home = tmp(), dir = tmp();
  put(home, ".claude/plugins/installed_plugins.json", claudeRecord("0.4.0"));
  init(dir, { log: logger(), home });
  put(dir, ".ai-dev-workflow.json", JSON.stringify({ kitVersion: "0.3.0", files: {} }));
  const text = labels(runChecks(dir, { sys: fakeSystem({ home }) }));
  assert.match(text, /plugin core@onrails is v0\.4\.0, the kit here is v0\.3\.0/);
});
