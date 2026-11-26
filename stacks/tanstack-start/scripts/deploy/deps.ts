// The side effects the session deploys inject (`DeployDeps`). The real ones are in scripts/deploy.ts,
// the fakes in fakes.ts.
import type { CommandResult } from '../cloudflare/deps.ts'

/** Extra variables for a child process. `undefined` removes one the shell has. */
export type ChildEnv = Record<string, string | undefined>

export interface DeployDeps {
  /** Runs a command (pnpm, git, gh) and returns its exit status and output. */
  run(cmd: string, args: string[], env?: ChildEnv): Promise<CommandResult>
  /** Runs `wrangler <args>` (through pnpm exec in the real entry). */
  wrangler(args: string[], env?: ChildEnv): Promise<CommandResult>
  /** The HTTP status of a GET with these headers, redirects not followed; 0 when it failed. */
  status(url: string, headers: Record<string, string>): Promise<number>
  /** A value from the shell, else from .env.cloudflare.local. Never logged. */
  local(name: string): string | undefined
  /** Every name and value in the shell and in .env.cloudflare.local, only to mask the secret ones. */
  known(): [string, string | undefined][]
  readText(path: string): string
  exists(path: string): boolean
  remove(path: string): void
  sleep(ms: number): Promise<void>
  log(line: string): void
}
