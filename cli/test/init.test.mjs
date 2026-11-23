import { test } from "node:test";
import assert from "node:assert/strict";
import { init } from "../src/init.mjs";
import { exists, logger, put, read, tmp } from "./helpers.mjs";

test("init into an empty folder installs the kit and a manifest", () => {
  const dir = tmp();
  const log = logger();
  assert.equal(init(dir, { log }), 0);
  for (const path of ["AGENTS.md", "CLAUDE.md", ".claude/settings.json", ".codex/config.toml",
    ".codex/rules/git-safety.rules", ".agents/skills/idea/SKILL.md", ".claude/skills/idea/SKILL.md",
    ".github/ISSUE_TEMPLATE/slice.md"]) assert.ok(exists(dir, path), path);
  assert.ok(!exists(dir, "stacks"), "stack packs are not installed by init");
  const manifest = JSON.parse(read(dir, ".ai-dev-workflow.json"));
  assert.equal(manifest.kitVersion, "0.3.0");
  assert.match(manifest.files["AGENTS.md"], /^[0-9a-f]{64}$/);
  assert.ok(!(".ai-dev-workflow.json" in manifest.files));
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
  assert.match(read(dir, "AGENTS.kit.md"), /Standing rules/);
  assert.match(log.text(), /\/join/);

  assert.equal(read(dir, "CLAUDE.md"), "Be nice.\n@AGENTS.md\n");

  const settings = JSON.parse(read(dir, ".claude/settings.json"));
  assert.equal(settings.model, "opus");
  assert.deepEqual(settings.permissions.allow, ["Read"]);
  assert.equal(settings.permissions.deny[0], "Bash(rm:*)");
  assert.equal(settings.permissions.deny.filter((r) => r === "Bash(git push -f:*)").length, 1, "deduped");
  assert.ok(settings.permissions.deny.includes("Bash(git push --force:*)"));

  assert.equal(read(dir, ".codex/config.toml"), 'model = "gpt"\n');
  assert.ok(exists(dir, ".codex/config.kit.toml"));
  assert.match(log.text(), /config\.kit\.toml/);

  assert.equal(read(dir, ".agents/skills/idea/SKILL.md"), "my own idea skill\n");
  assert.ok(exists(dir, ".agents/skills/idea/SKILL.md.kit-new"));

  const files = JSON.parse(read(dir, ".ai-dev-workflow.json")).files;
  assert.ok("AGENTS.kit.md" in files && !("AGENTS.md" in files));
  assert.ok(".codex/config.kit.toml" in files && !(".codex/config.toml" in files));
  assert.ok(!("CLAUDE.md" in files) && !(".claude/settings.json" in files));
  assert.notEqual(files[".agents/skills/idea/SKILL.md"], undefined, "offered copy recorded, so update stays quiet");
});

test("init leaves a CLAUDE.md that already imports AGENTS.md alone", () => {
  const dir = tmp();
  put(dir, "CLAUDE.md", "@AGENTS.md\n\nMore notes.\n");
  init(dir, { log: logger() });
  assert.equal(read(dir, "CLAUDE.md"), "@AGENTS.md\n\nMore notes.\n");
});
