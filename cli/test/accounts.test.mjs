import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { accountChecks, accountsList, expandHome, parseAccounts, readAccounts } from "../src/accounts.mjs";
import { runChecks } from "../src/checks.mjs";
import { TEMPLATE } from "../src/profile.mjs";
import { fakeSystem, logger, put, tmp } from "./helpers.mjs";

const PROFILE = `[routing]
everyday = "Model"

[sessions]
prefer = "cloud"

[accounts]
# a fixed split

[accounts.personal]
label = "Personal Max"          # a comment
tool = "claude"
config_dir = "~/.claude"
projects = ["*"]
jobs = ["live", "cto"]

[accounts.client]
label = "Client"
tool = "codex"
config_dir = "~/.codex-client"
projects = ["client-portal"]
jobs = ["*"]

[workflow]
label = "not an account"
`;

test("parseAccounts reads one entry per [accounts.<key>] table and nothing else", () => {
  assert.deepEqual(parseAccounts(PROFILE), [
    { key: "personal", label: "Personal Max", tool: "claude", config_dir: "~/.claude", projects: ["*"], jobs: ["live", "cto"] },
    { key: "client", label: "Client", tool: "codex", config_dir: "~/.codex-client", projects: ["client-portal"], jobs: ["*"] },
  ]);
});

test("the profile template has [sessions] and an [accounts] section with no live accounts", () => {
  const template = readFileSync(new URL(`../../${TEMPLATE}`, import.meta.url), "utf8");
  assert.match(template, /^\[sessions\]\nprefer = "cloud"/m);
  assert.match(template, /^\[accounts\]$/m);
  assert.match(template, /Never by usage/);
  assert.deepEqual(parseAccounts(template), [], "the examples are commented out");
  const uncommented = template.replace(/^# (\[accounts\.|label|tool|config_dir|projects|jobs)/gm, "$1");
  assert.deepEqual(parseAccounts(uncommented).map((a) => a.tool), ["claude", "claude"]);
});

test("readAccounts prefers the project's docs/profile.toml, then the home profile", () => {
  const home = tmp(), dir = tmp();
  assert.deepEqual(readAccounts(dir, { home }).accounts, []);
  put(home, ".onrails/profile.toml", '[accounts.home]\ntool = "claude"\nconfig_dir = "~/.claude"\n');
  assert.equal(readAccounts(dir, { home }).accounts[0].key, "home");
  put(dir, "docs/profile.toml", PROFILE);
  assert.equal(readAccounts(dir, { home }).accounts[0].key, "personal");
});

test("expandHome expands a leading ~ only", () => {
  assert.equal(expandHome("~/.claude-work", "/h"), "/h/.claude-work");
  assert.equal(expandHome("~", "/h"), "/h");
  assert.equal(expandHome("/abs/~x", "/h"), "/abs/~x");
});

test("accounts lists each account, its folder and the rule, and says when there are none", () => {
  const home = tmp(), dir = tmp();
  const none = logger();
  assert.equal(accountsList(dir, { home, log: none }), 0);
  assert.match(none.text(), /No \[accounts\]/);

  put(dir, "docs/profile.toml", PROFILE);
  mkdirSync(join(home, ".claude"));
  const log = logger();
  assert.equal(accountsList(dir, { home, log }), 0);
  assert.match(log.text(), /never moves to another account/);
  assert.match(log.text(), /^personal: Personal Max · claude · ~\/\.claude$/m);
  assert.match(log.text(), /^client: Client · codex · ~\/\.codex-client \(folder not found\)$/m);
  assert.match(log.text(), /projects: client-portal · jobs: \*/);
});

test("doctor checks that each config folder exists, and nothing inside it", () => {
  const home = tmp(), dir = tmp();
  assert.deepEqual(accountChecks(dir, { home }), [], "no accounts, no lines");

  put(dir, "docs/profile.toml", PROFILE);
  mkdirSync(join(home, ".claude"));
  // A file where a folder should be is not a config folder.
  put(home, ".codex-client", "not a folder\n");
  const [personal, client] = accountChecks(dir, { home });
  assert.equal(personal.status, "✓");
  assert.match(personal.label, /Account personal \(Personal Max\): ~\/\.claude exists/);
  assert.equal(client.status, "✗");
  assert.equal(client.required, false, "a missing account folder never fails doctor");
  assert.match(client.fix, /references\/accounts\.md/);

  const checks = runChecks(dir, { sys: fakeSystem({ home, commands: ["git", "claude"] }) });
  assert.ok(checks.some((c) => /Account client/.test(c.label)), "doctor runs the account checks");
});

test("doctor flags an unknown tool or a missing config_dir", () => {
  const home = tmp(), dir = tmp();
  put(dir, "docs/profile.toml", '[accounts.a]\ntool = "other"\nconfig_dir = "~/x"\n\n[accounts.b]\ntool = "claude"\n');
  const [a, b] = accountChecks(dir, { home });
  assert.match(a.label, /tool is "other"/);
  assert.match(b.label, /no config_dir/);
});
