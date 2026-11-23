// What the connect steps share while they run.
import type { Folders, Run, statusReader } from './places.ts'
import type { SecretsMode } from './secrets-mode.ts'
import type { terminal } from './terminal.ts'

export interface Context {
  folders: Folders
  run: Run
  /** Prefixes of secret keys across all providers: a public answer starting with one is refused. */
  secretPrefixes: string[]
  /** owner/repo from origin; every gh call is pinned to it. */
  repo: string | null
  /** Where GitHub values go: environments, or prefixed repository secrets (GitHub Free, private). */
  secretsMode: SecretsMode
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  now: Date
  say: (line: string) => void
  term: ReturnType<typeof terminal>
  status: ReturnType<typeof statusReader>
  result: { stored: string[]; skipped: string[]; failed: string[] }
}
