// Where CI runs, from the `ci = "..."` line in docs/stack.md. "actions" only when it says so:
// every repo is `ci = "local"` unless the person turned GitHub Actions on themselves. On local,
// setup-cloudflare and connect write nothing to GitHub (decision in docs/decisions.md, #139).
// setup-cloudflare and connect call readCi with the app's folder. The kit's push-secrets.mjs and
// setup-github.mjs keep their own copy of the rule and the lookup; the CLI's ci-local-secrets and
// deploy-keys-followups tests run the same cases and nested fixtures on all four (#160).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export type Ci = 'local' | 'actions'

/** A `ci = "actions"` line, a trailing `# comment` allowed. */
const CI_ACTIONS = /^ci[ \t]*=[ \t]*"actions"[ \t]*(?:#.*)?\r?$/m

/** The CI a docs/stack.md text names: "actions" only for a `ci = "actions"` line. */
export const ciFrom = (stack: string): Ci => (CI_ACTIONS.test(stack) ? 'actions' : 'local')

/** The folder holding `.git`, from `start` up; null before `git init`. */
function repoRoot(start: string): string | null {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return null
  }
}

/**
 * The nearest docs/stack.md from `start` up to the repository root (`.git`), or only in `start`
 * when there is no repository yet, so an unrelated folder above the app is never read. None: local.
 */
export function readCi(start: string): Ci {
  const from = resolve(start)
  const top = repoRoot(from) ?? from
  for (let dir = from; ; dir = dirname(dir)) {
    const file = join(dir, 'docs', 'stack.md')
    if (existsSync(file)) return ciFrom(readFileSync(file, 'utf8'))
    if (dir === top || dirname(dir) === dir) return 'local'
  }
}
