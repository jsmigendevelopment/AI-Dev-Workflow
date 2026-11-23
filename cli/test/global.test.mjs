import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runChecks } from "../src/checks.mjs";
import { initGlobal } from "../src/global.mjs";
import { exists, fakeSystem, logger, put, read, tmp } from "./helpers.mjs";

const kitSkill = (name) => read(fileURLToPath(new URL("../kit/files/core/", import.meta.url)), `.agents/skills/${name}/SKILL.md`);

test("init --global copies only idea, join, back and afk to both personal skills folders", () => {
  const home = tmp();
  assert.equal(initGlobal({ home, log: logger() }), 0);
  for (const root of [".claude/skills", ".agents/skills"]) {
    for (const name of ["idea", "join", "back", "afk"]) assert.equal(read(home, `${root}/${name}/SKILL.md`), kitSkill(name));
    assert.ok(exists(home, `${root}/idea/templates/state.md`), "a skill's own files come with it");
    for (const name of ["build", "coordinate", "stack-tanstack-start"]) assert.ok(!exists(home, `${root}/${name}`), name);
  }
});

test("init --global never overwrites: a changed file keeps yours and gets a .kit-new", () => {
  const home = tmp();
  put(home, ".claude/skills/idea/SKILL.md", "my idea\n");
  const log = logger();
  initGlobal({ home, log });
  assert.equal(read(home, ".claude/skills/idea/SKILL.md"), "my idea\n");
  assert.equal(read(home, ".claude/skills/idea/SKILL.md.kit-new"), kitSkill("idea"));
  assert.ok(!exists(home, ".agents/skills/idea/SKILL.md.kit-new"));
  assert.match(log.text(), /yours kept, kit's copy in ~\/\.claude\/skills\/idea\/SKILL\.md\.kit-new/);
  const again = logger();
  initGlobal({ home, log: again });
  assert.match(again.text(), /~\/\.agents\/skills: \d+ unchanged\./);
});

test("doctor warns when global entry skills differ from the CLI's kit, and is quiet without them", () => {
  const home = tmp();
  const labels = () => runChecks(tmp(), { sys: fakeSystem({ home }) }).map((c) => `${c.status} ${c.label}`).join("\n");
  assert.doesNotMatch(labels(), /skills: /);
  initGlobal({ home, log: logger() });
  assert.match(labels(), /✓ ~\/\.claude\/skills: entry skills match kit v0\.4\.0/);
  put(home, ".agents/skills/back/SKILL.md", "old back\n");
  const text = labels();
  assert.match(text, /✗ ~\/\.agents\/skills: back differ from this CLI's kit v0\.4\.0/);
  assert.match(text, /✓ ~\/\.claude\/skills/);
});

test("init --global through the binary uses HOME", () => {
  const home = tmp();
  const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [cli, "init", "--global"], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(exists(home, ".claude/skills/join/SKILL.md"));
  assert.ok(exists(home, ".agents/skills/afk/SKILL.md"));
});
