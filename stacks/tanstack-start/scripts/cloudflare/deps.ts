// The side effects setup-cloudflare injects (`Deps`), and its options. Fakes in fakes.ts.
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
  /** Runs `wrangler <args>` (through pnpm exec in the real entry), with optional stdin. */
  wrangler(args: string[], input?: string): Promise<CommandResult>
  /** Runs any other command (node, gh). */
  run(cmd: string, args: string[], input?: string): Promise<CommandResult>
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
  readText(path: string): string
  writeText(path: string, text: string): void
  exists(path: string): boolean
  remove(path: string): void
  log: (line: string) => void
  env: Record<string, string | undefined>
}

export interface Options {
  dryRun: boolean
  /** The zone (apex domain) for the security settings; default: the production routes' host. */
  zone?: string | undefined
  account?: string | undefined
  /** Bot Fight Mode on the zone: recommended once the production custom domain exists. */
  botFightMode?: boolean
  /** Cloudflare's managed robots.txt: off by default (the app writes its own). */
  managedRobots?: boolean
  skipSecrets?: boolean
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
