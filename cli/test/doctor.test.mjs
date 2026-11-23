import { test } from "node:test";
import assert from "node:assert/strict";
import { doctor } from "../src/doctor.mjs";
import { init } from "../src/init.mjs";
import { logger, put, tmp } from "./helpers.mjs";

test("doctor in an empty folder reports the missing kit and fails", () => {
  const log = logger();
  assert.equal(doctor(tmp(), { log }), 1);
  assert.match(log.text(), /✗ Kit not installed here/);
  assert.match(log.text(), /fix: Run: npx onrails init/);
});

test("doctor after init checks the kit and the skills mirror", () => {
  const dir = tmp();
  init(dir, { log: logger() });
  const log = logger();
  const code = doctor(dir, { log });
  assert.ok(code === 0 || code === 1);
  assert.match(log.text(), /✓ Kit v0\.4\.0 installed/);
  assert.match(log.text(), /✓ AGENTS\.md present/);
  assert.match(log.text(), /✓ \.agents\/skills and \.claude\/skills match/);
  assert.match(log.text(), /– No docs\/state\.md yet/);

  put(dir, ".claude/skills/idea/SKILL.md", "drifted\n");
  const drift = logger();
  doctor(dir, { log: drift });
  assert.match(drift.text(), /✗ \.agents\/skills and \.claude\/skills differ/);
});
