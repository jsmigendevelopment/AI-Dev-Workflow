import { test } from "node:test";
import assert from "node:assert/strict";
import { init } from "../src/init.mjs";
import { readFileSync } from "node:fs";
import { exists, logger, put, read, tmp } from "./helpers.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("init into an empty folder installs the kit and a manifest", () => {
  const dir = tmp();
  const log = logger();
  assert.equal(init(dir, { log }), 0);
  for (const path of ["AGENTS.md", "CLAUDE.md", ".claude/settings.json", ".codex/config.toml",
    ".codex/rules/git-safety.rules", ".agents/skills/idea/SKILL.md", ".claude/skills/idea/SKILL.md",
    ".github/ISSUE_TEMPLATE/slice.md"]) assert.ok(exists(dir, path), path);
  assert.ok(!exists(dir, "stacks"), "stack packs are not installed by init");
  const manifest = JSON.parse(read(dir, ".onrails.json"));
  assert.equal(manifest.kitVersion, version);
  assert.match(manifest.files["AGENTS.md"], /^[0-9a-f]{64}$/);
  assert.ok(!(".onrails.json" in manifest.files));
  assert.match(log.text(), /\/idea/);
  assert.match(log.text(), /trusted/);
});

test("init twice refuses and points to update", () => {
  const dir = tmp();
  init(dir, { log: logger() });
  const log = logger();
  assert.equal(init(dir, { log }), 1);
  assert.match(log.text(), /update/);
});

test("init keeps existing AGENTS.md, CLAUDE.md, settings.json and config.toml", () => {
  const dir = tmp();
  put(dir, "AGENTS.md", "# Our rules\n");
  put(dir, "CLAUDE.md", "Be nice.");
  put(dir, ".claude/settings.json", JSON.stringify({ model: "opus", permissions: { allow: ["Read"], deny: ["Bash(rm:*)", "Bash(git push -f:*)"] } }));
  put(dir, ".codex/config.toml", 'model = "gpt"\n');
  put(dir, ".agents/skills/idea/SKILL.md", "my own idea skill\n");
  const log = logger();
  assert.equal(init(dir, { log }), 0);

  assert.equal(read(dir, "AGENTS.md"), "# Our rules\n");
  assert.match(read(dir, "AGENTS.onrails.md"), /Standing rules/);
  assert.match(log.text(), /\/join/);

  assert.equal(read(dir, "CLAUDE.md"), "Be nice.\n@AGENTS.md\n");

  const settings = JSON.parse(read(dir, ".claude/settings.json"));
  assert.equal(settings.model, "opus");
  assert.equal(settings.permissions.allow[0], "Read"); // theirs kept, first
  assert.ok(settings.permissions.allow.includes("Bash(node .claude/hooks/notify.mjs:*)")); // the kit's added
  assert.ok(settings.hooks?.SessionStart, "the kit's hooks are merged in");
  assert.equal(settings.permissions.deny[0], "Bash(rm:*)");
  assert.equal(settings.permissions.deny.filter((r) => r === "Bash(git push -f:*)").length, 1, "deduped");
  assert.ok(settings.permissions.deny.includes("Bash(git push --force:*)"));

  assert.equal(read(dir, ".codex/config.toml"), 'model = "gpt"\n');
  assert.ok(exists(dir, ".codex/config.onrails.toml"));
  assert.match(log.text(), /config\.onrails\.toml/);

  assert.equal(read(dir, ".agents/skills/idea/SKILL.md"), "my own idea skill\n");
  assert.ok(exists(dir, ".agents/skills/idea/SKILL.md.onrails-new"));

  const files = JSON.parse(read(dir, ".onrails.json")).files;
  assert.ok("AGENTS.onrails.md" in files && !("AGENTS.md" in files));
  assert.ok(".codex/config.onrails.toml" in files && !(".codex/config.toml" in files));
  assert.ok(!("CLAUDE.md" in files) && !(".claude/settings.json" in files));
  assert.notEqual(files[".agents/skills/idea/SKILL.md"], undefined, "offered copy recorded, so update stays quiet");
});

test("init leaves a CLAUDE.md that already imports AGENTS.md alone", () => {
  const dir = tmp();
  put(dir, "CLAUDE.md", "@AGENTS.md\n\nMore notes.\n");
  init(dir, { log: logger() });
  assert.equal(read(dir, "CLAUDE.md"), "@AGENTS.md\n\nMore notes.\n");
});

test("init installs the Codex hooks, wired to the same scripts as the Claude Code hooks", () => {
  const dir = tmp();
  init(dir, { log: logger() });
  const codex = JSON.parse(read(dir, ".codex/hooks.json")).hooks;
  const claude = JSON.parse(read(dir, ".claude/settings.json")).hooks;
  const scripts = (groups) => groups.flatMap((g) => g.hooks).map((h) => h.command.match(/\/(\.[^"]+\.mjs)"?(.*)$/).slice(1).join("").trim());
  // Codex has no Notification event: PermissionRequest and Stop take its place.
  for (const [claudeEvent, codexEvents] of [["SessionStart", ["SessionStart"]], ["UserPromptSubmit", ["UserPromptSubmit"]],
    ["SessionEnd", ["SessionEnd"]], ["Notification", ["PermissionRequest", "Stop"]]]) {
    for (const event of codexEvents) assert.deepEqual(scripts(codex[event]), scripts(claude[claudeEvent]), event);
  }
  for (const handler of Object.values(codex).flat().flatMap((g) => g.hooks)) {
    assert.equal(handler.type, "command");
    const script = handler.command.match(/\/(\.[^"]+\.mjs)/)[1];
    assert.ok(exists(dir, script), script);
    assert.match(handler.command, /git rev-parse --show-toplevel/, "finds the repo root from a subfolder");
    assert.ok(handler.commandWindows.startsWith(`node ${script}`), "cmd.exe gets a command without sh syntax");
  }
  assert.ok(codex.SessionEnd[0].hooks[0].timeout <= 3, "Codex caps SessionEnd hooks at 3 seconds");
  assert.match(read(dir, ".codex/config.toml"), /^writable_roots = \["~\/\.onrails", "~\/\.ai-dev-workflow"\]$/m);
  assert.ok(".codex/hooks.json" in JSON.parse(read(dir, ".onrails.json")).files);
});

test("init keeps an existing .codex/hooks.json and offers the kit's as .onrails-new", () => {
  const dir = tmp();
  put(dir, ".codex/hooks.json", '{"hooks":{}}\n');
  init(dir, { log: logger() });
  assert.equal(read(dir, ".codex/hooks.json"), '{"hooks":{}}\n');
  assert.match(read(dir, ".codex/hooks.json.onrails-new"), /session-start\.mjs/);
});
