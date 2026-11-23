import { test } from "node:test";
import assert from "node:assert/strict";
import { doctor } from "../src/doctor.mjs";
import { envNames } from "../src/envfiles.mjs";
import { doctorFix } from "../src/fix.mjs";
import { exists, fakeSystem, logger, put, read, tmp } from "./helpers.mjs";

const VALUES = ["sk_live_TOPSECRET123", "quoted-secret-456", "single-secret-789", "after-export-000"];
const LOCAL = [
  "# a comment with = sign",
  `API_KEY=${VALUES[0]}`,
  `QUOTED="${VALUES[1]}"`,
  `SINGLE='${VALUES[2]}' # trailing`,
  `export EXPORTED=${VALUES[3]}`,
  "EMPTY_ONE=",
  'EMPTY_QUOTED=""',
  "EMPTY_COMMENT=  # nothing here",
  "",
].join("\n");

const noValues = (text) => VALUES.forEach((v) => assert.ok(!text.includes(v), `value leaked: ${v}`));

test("envNames reads names and emptiness only", () => {
  const vars = envNames(LOCAL);
  assert.deepEqual(vars.map((v) => v.name), ["API_KEY", "QUOTED", "SINGLE", "EXPORTED", "EMPTY_ONE", "EMPTY_QUOTED", "EMPTY_COMMENT"]);
  assert.deepEqual(vars.filter((v) => v.empty).map((v) => v.name), ["EMPTY_ONE", "EMPTY_QUOTED", "EMPTY_COMMENT"]);
  noValues(JSON.stringify(vars));
});

test("doctor names missing and empty variables without printing any value", () => {
  const dir = tmp();
  put(dir, ".env.local", LOCAL);
  put(dir, ".env.example", "API_KEY=\n");
  const log = logger();
  doctor(dir, { log, sys: fakeSystem() });
  const out = log.text();
  assert.match(out, /✗ \.env\.example is missing 6 name\(s\) from \.env\.local: QUOTED, SINGLE, EXPORTED, EMPTY_ONE/);
  assert.match(out, /– Empty in \.env\.local: EMPTY_ONE, EMPTY_QUOTED, EMPTY_COMMENT/);
  noValues(out);
});

test("doctor --fix adds names, never values, to .env.example (and creates it if missing)", async () => {
  const dir = tmp();
  put(dir, ".env.local", LOCAL);
  put(dir, ".env.example", "API_KEY=");
  const log = logger();
  await doctorFix(dir, { log, yes: true, sys: fakeSystem() });
  const example = read(dir, ".env.example");
  assert.equal(example, "API_KEY=\nQUOTED=\nSINGLE=\nEXPORTED=\nEMPTY_ONE=\nEMPTY_QUOTED=\nEMPTY_COMMENT=\n");
  noValues(log.text());

  const fresh = tmp();
  put(fresh, ".env.local", LOCAL);
  const dry = logger();
  await doctorFix(fresh, { log: dry, dryRun: true, sys: fakeSystem() });
  assert.match(dry.text(), /do: create \.env\.example with 7 name\(s\), no values/);
  assert.ok(!exists(fresh, ".env.example"), "dry run writes nothing");
  await doctorFix(fresh, { log: dry, yes: true, sys: fakeSystem() });
  noValues(read(fresh, ".env.example") + dry.text());
  assert.match(read(fresh, ".env.example"), /^API_KEY=$/m);
});

test("only a .env.example, or neither file, is fine", () => {
  const log = logger();
  doctor(tmp(), { log, sys: fakeSystem() });
  assert.match(log.text(), /– No \.env\.example yet/);
  const dir = tmp();
  put(dir, ".env.example", "A=\n");
  const log2 = logger();
  doctor(dir, { log: log2, sys: fakeSystem() });
  assert.match(log2.text(), /✓ \.env\.example present/);
});
