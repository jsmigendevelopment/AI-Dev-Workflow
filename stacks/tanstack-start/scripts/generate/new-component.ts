// `pnpm new:component <module> <name>`: a small presentational component in the module's
// ui/components (props in, markup out; no data, no router) and its test.
import { join } from 'node:path'

import {
  fail,
  human,
  kebab,
  pascal,
  positional,
  render,
  report,
  requireModule,
  template,
  tidy,
  writeAll,
} from './lib.ts'

const [mod, name] = positional(process.argv.slice(2))
if (!mod || !name)
  fail('Usage: pnpm new:component <module> <name>   e.g. pnpm new:component tasks task-badge')
const dir = requireModule(kebab(mod, 'The module'))
kebab(name, 'The component name')
const tokens = {
  __Name__: pascal(name),
  __Title__: human(name).replace(/^./, (c) => c.toUpperCase()),
  __file__: name,
}
const written = writeAll([
  [join(dir, 'ui/components', `${name}.tsx`), render(template('parts/component.tsx.tpl'), tokens)],
  [join(dir, 'ui/components', `${name}.test.tsx`), render(template('parts/component.test.tsx.tpl'), tokens)],
])
tidy(written)
report(written, ['Use it from a section or another component of the module.'])
