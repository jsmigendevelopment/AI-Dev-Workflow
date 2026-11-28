// #476: a quoted table header names the same TOML table as the bare one, so roles.mjs reads `["routing"]` and
// `['routing']` as the [routing] table instead of skipping their keys with no warning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/routing/scripts/roles.mjs", import.meta.url));
const roles = () => import(SCRIPT);

// What a profile's routing keys resolve to, and every warning on the way.
async function resolve(text) {
  const { resolveRoles } = await roles();
  const warnings = [];
  const got = resolveRoles([{ label: "docs/profile.toml", text }], (w) => warnings.push(w));
  return { got, warnings };
}

test('AC-476-1: WHEN routing keys sit under ["routing"] THEN they are read as the [routing] table, with spaces and a comment too', async () => {
  for (const header of ['["routing"]', '[ "routing" ]', '  ["routing"]  # my picks', '["routing"]# my picks']) {
    const { got, warnings } = await resolve(`${header}\ncto = "Claude Opus 5.5"\nbuilder_effort = "high"\n`);
    assert.equal(got.cto.model, "Claude Opus 5.5", header);
    assert.equal(got.builder.effort, "high", header);
    assert.deepEqual(warnings, [], header);
  }
});

test("AC-476-1: WHEN routing keys sit under ['routing'] THEN they are read as the [routing] table, with spaces and a comment too", async () => {
  for (const header of ["['routing']", "[ 'routing' ]", "  ['routing']  # my picks", "['routing']# my picks"]) {
    const { got, warnings } = await resolve(`${header}\ncto = "Claude Opus 5.5"\nbuilder_effort = "high"\n`);
    assert.equal(got.cto.model, "Claude Opus 5.5", header);
    assert.equal(got.builder.effort, "high", header);
    assert.deepEqual(warnings, [], header);
  }
});

test('AC-476-1: WHEN a quoted header names anything but the one routing table THEN its keys are still skipped, as before', async () => {
  for (const header of ['["routing.x"]', '["other"]', '["routing_notes"]', `["routing']`, `['routing"]`, '["routing" x]']) {
    const { got } = await resolve(`${header}\ncto = "Claude Opus 5.5"\n`);
    assert.equal(got.cto.model, "Claude Fable 5.2", header);
  }
});

test('AC-476-1: WHEN a profile has [routing] and then ["routing"] THEN the first value of a key wins, as for a repeated [routing]', async () => {
  const { got, warnings } = await resolve('[routing]\ncto = "Claude Opus 5.5"\n["routing"]\ncto = "Claude Sonnet 5.5"\nbuilder = "Claude Opus 5.5"\n');
  assert.equal(got.cto.model, "Claude Opus 5.5");
  assert.equal(got.builder.model, "Claude Opus 5.5");
  assert.deepEqual(warnings, []);
});

test("AC-476-1: WHEN [[routing]], [routing.<name>] or their quoted forms are used THEN they still warn", async () => {
  for (const header of ["[[routing]]", "[routing.models]", "[ routing . x ]", '[["routing"]]', "[['routing']]", '["routing".x]', "['routing'.x]"]) {
    const { got, warnings } = await resolve(`${header}\ncto = "Claude Opus 5.5"\n`);
    assert.equal(got.cto.model, "Claude Fable 5.2", header);
    assert.equal(warnings.length, 1, header);
  }
});
