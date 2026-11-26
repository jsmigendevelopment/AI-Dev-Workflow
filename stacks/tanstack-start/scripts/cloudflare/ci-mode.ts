// Where CI runs, from the `ci = "..."` line in docs/stack.md. "actions" only when it says so:
// every repo is `ci = "local"` unless the person turned GitHub Actions on themselves. On local,
// setup-cloudflare and connect write nothing to GitHub (decision in docs/decisions.md, #139).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type Ci = 'local' | 'actions'

/** The CI a docs/stack.md text names: "actions" only for an exact `ci = "actions"` line. */
export const ciFrom = (stack: string): Ci => (/^ci\s*=\s*"actions"\s*$/m.test(stack) ? 'actions' : 'local')

/** The nearest docs/stack.md from `start` up to the repository root (`.git`); none means local. */
export function readCi(start: string): Ci {
  for (let dir = start; ; dir = dirname(dir)) {
    const file = join(dir, 'docs', 'stack.md')
    if (existsSync(file)) return ciFrom(readFileSync(file, 'utf8'))
    if (existsSync(join(dir, '.git')) || dirname(dir) === dir) return 'local'
  }
}
