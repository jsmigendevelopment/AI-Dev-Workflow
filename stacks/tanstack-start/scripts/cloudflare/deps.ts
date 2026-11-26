// The side effects setup-cloudflare injects (`Deps`), and its options. Fakes in fakes.ts.
import type { Ci } from './ci-mode.ts'

export interface CommandResult {
  status: number
  stdout: string
  stderr: string
}

export interface ApiResult {
  status: number
  body: { success?: boolean; result?: unknown; errors?: { message: string }[] } | null
}

export interface Deps {
  /**
   * Runs `wrangler <args>` (through pnpm exec in the real entry), with optional stdin and extra
   * environment variables (`CLOUDFLARE_ENV`).
   */
  wrangler(args: string[], input?: string, env?: Record<string, string>): Promise<CommandResult>
  /** Runs any other command (node, gh, pnpm). */
  run(cmd: string, args: string[], input?: string, env?: Record<string, string>): Promise<CommandResult>
  /**
   * The Cloudflare API. Paths under `/zones` use the zone token; paths under `/accounts` use the
   * Access token (Cloudflare Access only).
   */
  api(method: string, path: string, body?: unknown): Promise<ApiResult>
  /** A new random secret: 32 URL-safe characters (the password gate's SITE_PASSWORD). */
  randomSecret(): string
  /**
   * A login provider's client id or secret (`ACCESS_GOOGLE_CLIENT_SECRET`), from the shell or
   * .env.cloudflare.local. Only ever sent to the Cloudflare API, never logged.
   */
  secret(name: string): string | undefined
  /**
   * Why .env.cloudflare.local can't take a secret (not git-ignored, or not writable), or null.
   * Checked before one is made. `create`: make the file (mode 600) or open it for writing; a dry
   * run passes false and only reads.
   */
  localProblem(create: boolean): string | null
  /**
   * Saves `NAME=value` in .env.cloudflare.local (git-ignored, mode 600), where the deploys read it.
   * False when the value can't be written safely; it may also throw (EACCES, a full disk). The
   * value is never printed.
   */
  saveLocal(name: string, value: string): boolean
  /** Whether the deploys can read a value for `name` (the shell or .env.cloudflare.local). Never the value. */
  hasLocal(name: string): boolean
  readText(path: string): string
  writeText(path: string, text: string): void
  exists(path: string): boolean
  remove(path: string): void
  log: (line: string) => void
  env: Record<string, string | undefined>
}

export interface Options {
  dryRun: boolean
  /** `ci` in docs/stack.md. Only "actions" writes GitHub environments and secrets; unset means local. */
  ci?: Ci | undefined
  /** The zone (apex domain) for the security settings; default: the production routes' host. */
  zone?: string | undefined
  account?: string | undefined
  /** Bot Fight Mode on the zone: recommended once the production custom domain exists. */
  botFightMode?: boolean
  /** Cloudflare's managed robots.txt: off by default (the app writes its own). */
  managedRobots?: boolean
  skipSecrets?: boolean
  /** Skip the first test deploy (the test Worker that pull request previews upload to). */
  noFirstDeploy?: boolean
  /** How the test Worker and its previews are protected: the person's choice (`PROTECTION_CHOICES`). */
  protect?: Protection | undefined
  /** Cloudflare Access: the old single-email flag, same as one entry in `allowEmails`. */
  accessEmail?: string | undefined
  /** Cloudflare Access: `--logins google,github` (the one-time PIN is always added). */
  logins?: string | undefined
  /** Cloudflare Access: who may sign in. Asked at setup, never written to a file. */
  allowEmails?: string[] | undefined
  allowDomains?: string[] | undefined
  allowGithubOrg?: string | undefined
  /** Access in front of production: "all", or paths like "/admin/*,/ops/*". */
  protectProduction?: string | undefined
  /** The person said yes to the production change (always-stop list). Needed for a real run. */
  productionOk?: boolean
  /** The password gate only: make a new SITE_PASSWORD even if one is set. */
  newPassword?: boolean
}

export const PROTECTIONS = ['access', 'password', 'none'] as const
export type Protection = (typeof PROTECTIONS)[number]

export type Log = (line: string) => void
