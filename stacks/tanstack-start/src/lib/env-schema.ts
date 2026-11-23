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
    CLERK_PUBLISHABLE_KEY: optional(z.string().startsWith('pk_', 'must start with pk_')),
    CLERK_SECRET_KEY: optional(z.string().startsWith('sk_', 'must start with sk_')),
    /** Optional: the instance's PEM public key (Clerk dashboard → API keys → JWKS public key). */
    CLERK_JWT_KEY: optional(z.string().includes('BEGIN PUBLIC KEY', { message: 'must be a PEM public key' })),
    TURNSTILE_SITE_KEY: optional(z.string().regex(/^[\w-]{10,}$/, 'is not a Turnstile site key')),
    TURNSTILE_SECRET_KEY: optional(z.string().regex(/^[\w-]{10,}$/, 'is not a Turnstile secret key')),
    /**
     * "true" serves the app; anything else serves the "Coming soon" page (src/lib/launch.ts). A var
     * per environment in wrangler.jsonc: "false" in production until the person says go live.
     * Unset counts as not launched, so a missing var never opens the app.
     */
    LAUNCHED: optional(z.enum(['true', 'false'], { error: 'must be "true" or "false"' })),
    /** How the test Worker and its previews are protected (setup-cloudflare records it). */
    SITE_PROTECTION: optional(
      z.enum(['access', 'password', 'none'], { error: 'must be "access", "password" or "none"' }),
    ),
    /** The password gate's secret, made by setup-cloudflare. Random, at least 24 URL-safe characters. */
    SITE_PASSWORD: optional(
      z.string().regex(/^[\w-]{24,}$/, 'must be at least 24 random URL-safe characters'),
    ),
  })
  .superRefine((env, ctx) => {
    const pairs = [
      ['CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'],
      ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'],
    ] as const
    if (env.SITE_PROTECTION === 'password' && !env.SITE_PASSWORD)
      ctx.addIssue({
        code: 'custom',
        path: ['SITE_PASSWORD'],
        message: 'is missing (SITE_PROTECTION is "password"; run setup-cloudflare --protect password)',
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

export type BuildEnv = z.output<typeof buildEnvSchema>
export type RuntimeEnv = z.output<typeof runtimeEnvSchema>

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
