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
  /** A plain file's text, never through a symlink; undefined when it is missing, a link or not a file. */
  readPlain(path: string): string | undefined
  exists(path: string): boolean
  remove(path: string): void
  /** Creates a file only if it doesn't exist yet (its folder too). False when it already exists. */
  create(path: string, text: string): boolean
  /** Whether a process with this PID is still running on this machine. */
  alive(pid: number): boolean
  /** This process's PID. */
  pid: number
  sleep(ms: number): Promise<void>
  log(line: string): void
}
