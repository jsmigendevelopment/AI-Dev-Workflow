import { createServerOnlyFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'

import { parseEnv, type RuntimeEnv, runtimeEnvSchema } from '@/lib/env-schema'

let cached: RuntimeEnv | undefined

/**
 * The Worker's vars and secrets, validated once per isolate on the first request. A bad or
 * half-set pair throws with the variable names (never values), so every request fails with a
 * clear log line instead of half-working. Read inside handlers only, never at module scope.
 */
export const serverEnv = createServerOnlyFn((): RuntimeEnv => {
  cached ??= parseEnv(
    runtimeEnvSchema,
    {
      CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
      CLERK_JWT_KEY: env.CLERK_JWT_KEY,
      TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY,
      TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
      LAUNCHED: env.LAUNCHED,
      SITE_PROTECTION: env.SITE_PROTECTION,
      SITE_PASSWORD: env.SITE_PASSWORD,
      ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN,
      ACCESS_AUD: env.ACCESS_AUD,
      ACCESS_PATHS: env.ACCESS_PATHS,
    },
    'Worker',
  )
  return cached
})
