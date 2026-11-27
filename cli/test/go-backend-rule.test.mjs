import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('AC-344-1: the backend and Workers questions come before the framework, with three outcomes', () => {
  const skill = read('.agents/skills/stack/SKILL.md');
  const order = skill.slice(skill.indexOf('## Order'), skill.indexOf('\n## ', skill.indexOf('## Order') + 1));
  const backend = order.indexOf('Does this app need a backend?');
  const workers = order.indexOf('Will it run on Cloudflare Workers?');
  const framework = order.indexOf('**Framework and language.**');
  assert.ok(backend > -1 && workers > backend && framework > workers);
  assert.match(order, /No backend \| \*\*TanStack Start\*\* alone/);
  assert.match(order, /Backend on Workers \| \*\*TypeScript\*\*/);
  assert.match(order, /Backend not on Workers \| \*\*Go backend\*\*/);
});

test('AC-344-5: the stack template has a Backend row', () => {
  assert.match(read('.agents/skills/idea/templates/stack.md'), /^\| Backend \| none \/ TypeScript on Workers \/ Go \|/m);
});
