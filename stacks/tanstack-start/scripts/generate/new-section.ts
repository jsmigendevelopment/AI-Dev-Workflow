// `pnpm new:section <module> <name>`: ui/sections/<name>-section.tsx (Suspense > error boundary >
// content, with a skeleton of the same shape and ErrorState) and its test. It starts from the
// module's list query; replace the content with what the section shows.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  camel,
  fail,
  human,
  kebab,
  pascal,
  positional,
  refuseUnknownFlags,
  render,
  report,
  requireModule,
  template,
  tidy,
  writeAll,
} from './lib.ts'

refuseUnknownFlags(['--dry'])
const [mod, name] = positional(process.argv.slice(2))
if (!mod || !name) fail('Usage: pnpm new:section <module> <name>   e.g. pnpm new:section tasks overdue')
const dir = requireModule(kebab(mod, 'The module'))
kebab(name, 'The section name')
const hooks = join(dir, 'hooks', `use-${mod}.ts`)
if (!existsSync(hooks) || !readFileSync(hooks, 'utf8').includes(`export const ${camel(mod)}Queries`))
  fail(
    `${hooks} has no ${camel(mod)}Queries.list(). Sections start from it: make the module with pnpm new:module.`,
  )

const file = `${name}-section`
const tokens = {
  __Name__: pascal(name),
  __Title__: human(name).replace(/^./, (c) => c.toUpperCase()),
  __key__: `${mod}-${name}`,
  __file__: file,
  __mod__: mod,
  __plural__: camel(mod),
}
const written = writeAll([
  [join(dir, 'ui/sections', `${file}.tsx`), render(template('parts/section.tsx.tpl'), tokens)],
  [join(dir, 'ui/sections', `${file}.test.tsx`), render(template('parts/section.test.tsx.tpl'), tokens)],
])
tidy(written)
report(written, [`Place <${pascal(name)}Section /> in one of the module's views.`])
