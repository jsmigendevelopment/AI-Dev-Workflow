// `pnpm new:table <module> <name>`: server/<name>.table.ts with id, created_at and updated_at
// (snake_case, epoch-ms UTC times), then the migration for it (drizzle-kit).
import { join } from 'node:path'

import {
  camel,
  fail,
  human,
  kebab,
  migrate,
  positional,
  render,
  report,
  requireModule,
  snake,
  tableTokens,
  template,
  tidy,
  writeAll,
} from './lib.ts'

const [mod, name] = positional(process.argv.slice(2))
if (!mod || !name) fail('Usage: pnpm new:table <module> <name>   e.g. pnpm new:table tasks task-labels')
const dir = requireModule(kebab(mod, 'The module'))
kebab(name, 'The table name')
const tokens = {
  ...tableTokens(false),
  __Title__: `The ${human(name)} table`,
  __var__: camel(name),
  __table__: snake(name),
}
const written = writeAll([
  [join(dir, 'server', `${name}.table.ts`), render(template('parts/table.ts.tpl'), tokens)],
])
tidy(written)
migrate(snake(name))
report(
  [...written, 'migrations/'],
  [
    'Add the columns the issue needs (snake_case, money as *_cents integers) and run pnpm db:generate.',
    'Read the SQL before you commit it. Then a repository port, adapter and fake: copy the module’s own.',
  ],
)
