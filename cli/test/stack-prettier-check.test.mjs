import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);

test("AC-511-1: WHEN the stack skill's pack-change check is read THEN it says to run npm test with ONRAILS_PRETTIER_INSTALL=1 (or ONRAILS_PRETTIER_DIR), so the AC-421-2 tests do not skip", () => {
  const skill = readFileSync(new URL('.agents/skills/stack/SKILL.md', root), 'utf8');
  const start = skill.indexOf('## Stack packs');
  const packs = skill.slice(start, skill.indexOf('\n## ', start + 1));
  const line = packs.split('\n').find((l) => l.includes('ONRAILS_PRETTIER_INSTALL=1'));
  assert.ok(line, 'the Stack packs section names ONRAILS_PRETTIER_INSTALL=1');
  assert.match(line, /`npm test`/);
  assert.match(line, /`ONRAILS_PRETTIER_DIR`/);
  assert.match(line, /AC-421-2/);
});
