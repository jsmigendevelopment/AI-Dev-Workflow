import { test } from "node:test";
import assert from "node:assert/strict";
import { doctor } from "../src/doctor.mjs";
import { init } from "../src/init.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger, put, tmp } from "./helpers.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const V = version.replaceAll(".", "\\.");

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
  assert.match(log.text(), new RegExp(`✓ Kit v${V} installed`));
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

// #143 item 5: a repo on Full automation that still runs a kit from before the Full override stops for
// gates that Full and the person's decisions lift. doctor says to update.
const FULL = "# Stack\n\n## Automation level\n\n- **Level:** full  <!-- recommended | full | hands-on | custom -->\n";
const RECOMMENDED = "# Stack\n\n## Automation level\n\n- **Level:** recommended\n";
function onKit(kitVersion, stack) {
  const dir = tmp();
  init(dir, { log: logger() });
  const manifest = JSON.parse(readFileSync(join(dir, ".onrails.json"), "utf8"));
  put(dir, ".onrails.json", JSON.stringify({ ...manifest, kitVersion }));
  put(dir, "docs/stack.md", stack);
  const log = logger();
  doctor(dir, { log });
  return log.text();
}

test("AC-143-4: WHEN doctor runs in a repo on Full with a kit older than 0.7.0 THEN it says to update", () => {
  const text = onKit("0.5.3", FULL);
  assert.match(text, /✗ Full automation on kit v0\.5\.3: kits before v0\.7\.0 still stop for gates that Full and your decisions lift/);
  assert.match(text, /fix: Run: npx onrails@latest update/);
});

test("AC-143-4: doctor stays quiet about it on Recommended, or on Full with kit 0.7.0 or newer", () => {
  assert.doesNotMatch(onKit("0.5.3", RECOMMENDED), /Full automation on kit/);
  assert.doesNotMatch(onKit("0.7.0", FULL), /Full automation on kit/);
  assert.doesNotMatch(onKit("0.10.0", FULL), /Full automation on kit/);
});
