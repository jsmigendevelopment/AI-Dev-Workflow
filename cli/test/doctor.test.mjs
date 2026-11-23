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

test("doctor lists stale research dossiers by name, and stays quiet without docs/research", () => {
  const dir = tmp();
  init(dir, { log: logger() });
  const none = logger();
  doctor(dir, { log: none });
  assert.doesNotMatch(none.text(), /research dossier/);

  const header = "| Dossier | Question | Decision | Date | Status | Re-check | Author model · effort |\n|---|---|---|---|---|---|---|\n";
  put(dir, "docs/research/README.md", `${header}| [Old](old.md) | Which? | none yet | 2020-01-01 | current | 2020-06-01 | unknown · unknown |\n`);
  const log = logger();
  doctor(dir, { log });
  assert.match(log.text(), /✗ 1 stale research dossier\(s\): old\.md \(re-check 2020-06-01\)/);
  assert.match(log.text(), /fix: Re-check each with the research skill/);

  put(dir, "docs/research/README.md", header);
  const fresh = logger();
  doctor(dir, { log: fresh });
  assert.match(fresh.text(), /✓ No stale research dossiers/);
});
