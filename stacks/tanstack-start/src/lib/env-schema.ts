import * as z from 'zod'

/**
 * Every variable the app reads, in one place. Two groups:
 *
 * - Build time (`vite.config.ts` reads them from `.env` or the shell): public values baked into
 *   the HTML. Never put a secret here.
 * - Runtime (Worker vars and secrets, `.dev.vars` locally): read per request in `src/server/env.ts`.
 *
 * Everything is optional, so a fresh clone runs with no keys. A half-configured pair (one key of
 * two) fails fast with the variable names, never their values.
 */

const optional = (schema: z.ZodType<string>) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional())

// One origin: lowercase scheme and host, an optional port, no path, no wildcard.
const ORIGIN = String.raw`https?:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::\d{1,5})?`

export const buildEnvSchema = z.object({
  /** The one site-URL source: canonicals, og:url, sitemap, robots, security.txt. No trailing slash. */
  SITE_URL: optional(
    z
      .url({ protocol: /^https?$/, error: 'must be an absolute http(s) URL' })
      .refine((v) => !v.endsWith('/'), 'must not end with a slash'),
  ),
  /** Where to report a security problem: `mailto:` or `https:` (RFC 9116). */
  SECURITY_CONTACT: optional(
    z.string().regex(/^(mailto:|https:\/\/)\S+$/, 'must start with mailto: or https://'),
  ),
})

export const runtimeEnvSchema = z
  .object({
    /** The name Clerk's CLI writes and its TanStack Start docs use. Public, though read at runtime. */
    VITE_CLERK_PUBLISHABLE_KEY: optional(z.string().startsWith('pk_', 'must start with pk_')),
    CLERK_SECRET_KEY: optional(z.string().startsWith('sk_', 'must start with sk_')),
    /** Optional: the instance's PEM public key (Clerk dashboard → API keys → JWKS public key). */
    CLERK_JWT_KEY: optional(z.string().includes('BEGIN PUBLIC KEY', { message: 'must be a PEM public key' })),
    /**
     * Optional: more origins Clerk session tokens may come from (their `azp`), comma-separated
     * exact origins, no wildcards. SITE_URL and this environment's own origins are already in
     * (src/lib/authorized-parties.ts). For a custom test domain or a second production domain.
     */
    CLERK_AUTHORIZED_PARTIES: optional(
      z
        .string()
        .regex(
          new RegExp(`^${ORIGIN}(\\s*,\\s*${ORIGIN})*$`),
          'must be exact origins like https://app.example.com,https://www.example.com',
        ),
    ),
    /**
     * "true" lets a native app's bearer token on `/api/v1` through without `azp` (it sends no
     * Origin), when it also carries the `app` claim below. Off by default; the monorepo-expo pack
     * turns it on. Any other native app on the same Clerk instance can use its tokens here (the
     * claim is in every token the instance issues): use one Clerk instance per product.
     */
    CLERK_ALLOW_NATIVE_TOKENS: optional(z.enum(['true', 'false'], { error: 'must be "true" or "false"' })),
    /**
     * The value a native token's `app` claim must have, set in Clerk's session token claims
     * (`{"app": "<this value>"}`). Not a secret: every session token carries it. Unset with
     * native tokens on: every native token is refused (src/lib/authorized-parties.ts).
     */
    CLERK_NATIVE_APP_CLAIM: optional(
      z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, 'must be 1 to 64 of a-z, 0-9, ".", "_" or "-"'),
    ),
    TURNSTILE_SITE_KEY: optional(z.string().regex(/^[\w-]{10,}$/, 'is not a Turnstile site key')),
    TURNSTILE_SECRET_KEY: optional(z.string().regex(/^[\w-]{10,}$/, 'is not a Turnstile secret key')),
    /**
     * "true" serves the app; anything else serves the "Coming soon" page (src/lib/launch.ts). A var
     * per environment in wrangler.jsonc: "false" in production until the person says go live.
     * Unset counts as not launched, so a missing var never opens the app.
     */
    LAUNCHED: optional(z.enum(['true', 'false'], { error: 'must be "true" or "false"' })),
    /**
     * How this environment is protected (setup-cloudflare records it): the test Worker and its
     * previews, or production with --protect-production.
     */
    SITE_PROTECTION: optional(
      z.enum(['access', 'password', 'none'], { error: 'must be "access", "password" or "none"' }),
    ),
    /** The password gate's secret, made by setup-cloudflare. Random, at least 24 URL-safe characters. */
    SITE_PASSWORD: optional(
      z.string().regex(/^[\w-]{24,}$/, 'must be at least 24 random URL-safe characters'),
    ),
    /** Cloudflare Access: `https://<team>.cloudflareaccess.com`, the JWT's issuer (setup-cloudflare). */
    ACCESS_TEAM_DOMAIN: optional(
      z
        .string()
        .regex(
          /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/,
          'must be https://<team>.cloudflareaccess.com',
        ),
    ),
    /** Cloudflare Access: the application's audience (AUD) tag, the JWT's `aud` (setup-cloudflare). */
    ACCESS_AUD: optional(z.string().regex(/^[0-9a-f]{32,64}$/, 'must be the Access app’s AUD tag (hex)')),
    /** Cloudflare Access: paths that need the JWT, comma-separated ("/admin/*,/ops/*"). Unset: all. */
    ACCESS_PATHS: optional(
      z.string().regex(/^\/[\w\-./]*\*?(,\/[\w\-./]*\*?)*$/, 'must be paths like /admin/*,/ops/*'),
    ),
  })
  .superRefine((env, ctx) => {
    const pairs = [
      ['VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'],
      ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'],
    ] as const
    if (env.SITE_PROTECTION === 'password' && !env.SITE_PASSWORD)
      ctx.addIssue({
        code: 'custom',
        path: ['SITE_PASSWORD'],
        message: 'is missing (SITE_PROTECTION is "password"; run setup-cloudflare --protect password)',
      })
    // Fails closed: "access" without the values to check the JWT is a broken config, not "off".
    if (env.SITE_PROTECTION === 'access')
      for (const name of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD'] as const)
        if (!env[name])
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'is missing (SITE_PROTECTION is "access"; run setup-cloudflare --protect access)',
          })
    if (env.CLERK_JWT_KEY && !env.CLERK_SECRET_KEY)
      ctx.addIssue({ code: 'custom', path: ['CLERK_JWT_KEY'], message: 'needs CLERK_SECRET_KEY too' })
    for (const [a, b] of pairs) {
      if (Boolean(env[a]) !== Boolean(env[b])) {
        const missing = env[a] ? b : a
        ctx.addIssue({
          code: 'custom',
          path: [missing],
          message: `is missing (set both ${a} and ${b}, or neither)`,
        })
      }
    }
  })

export type RuntimeEnv = z.output<typeof runtimeEnvSchema>

type RawEnv = Record<string, string | undefined>

/** Old names still read, and the name each one means now. */
const ALIASES = { CLERK_PUBLISHABLE_KEY: 'VITE_CLERK_PUBLISHABLE_KEY' } as const

/**
 * Before the schema: an old name's value moves to its current name (the current one wins when
 * both are set), and `warn` hears each old name once for the life of the returned reader. `warn`
 * gets names only, never a value.
 */
export function envAliases(warn: (oldName: string, name: string) => void): (raw: RawEnv) => RawEnv {
  const warned = new Set<string>()
  return (raw) => {
    const out = { ...raw }
    for (const [oldName, name] of Object.entries(ALIASES)) {
      const value = out[oldName]
      delete out[oldName]
      if (value === undefined || value.trim() === '') continue
      if (out[name] === undefined || out[name].trim() === '') out[name] = value
      if (!warned.has(oldName)) {
        warned.add(oldName)
        warn(oldName, name)
      }
    }
    return out
  }
}

/** Names and rules only. A Zod message never carries the value, and this never adds one. */
export function describeEnvError(error: z.ZodError, where: string): string {
  const lines = error.issues.map((issue) => `  - ${issue.path.join('.') || '(env)'} ${issue.message}`)
  return `Invalid ${where} environment:\n${lines.join('\n')}\nFix the names above in .env, .dev.vars or the Worker's settings.`
}

export function parseEnv<S extends z.ZodType>(schema: S, raw: unknown, where: string): z.output<S> {
  const result = schema.safeParse(raw)
  if (!result.success) throw new Error(describeEnvError(result.error, where))
  return result.data
}
