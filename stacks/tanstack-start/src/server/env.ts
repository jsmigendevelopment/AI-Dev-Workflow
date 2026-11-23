import { createServerOnlyFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'

import { partiesConfigError } from '@/lib/authorized-parties'
import { BUILD_TARGET } from '@/lib/build-target'
import { envAliases, parseEnv, type RuntimeEnv, runtimeEnvSchema } from '@/lib/env-schema'
import { logger } from '@/lib/logger'

let cached: RuntimeEnv | undefined

// Once per isolate: an app set up with an old name keeps working and says which name to move to.
const withAliases = envAliases((from, to) => logger.warn('env_name_deprecated', { from, to }))

/**
 * The Worker's vars and secrets, validated once per isolate on the first request. A bad or
 * half-set pair throws with the variable names (never values), so every request fails with a
 * clear log line instead of half-working. Read inside handlers only, never at module scope.
 */
export const serverEnv = createServerOnlyFn((): RuntimeEnv => {
  if (cached) return cached
  const parsed = parseEnv(
    runtimeEnvSchema,
    withAliases({
      VITE_CLERK_PUBLISHABLE_KEY: env.VITE_CLERK_PUBLISHABLE_KEY,
      CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
      CLERK_JWT_KEY: env.CLERK_JWT_KEY,
      CLERK_AUTHORIZED_PARTIES: env.CLERK_AUTHORIZED_PARTIES,
      CLERK_ALLOW_NATIVE_TOKENS: env.CLERK_ALLOW_NATIVE_TOKENS,
      TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY,
      TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
      LAUNCHED: env.LAUNCHED,
      SITE_PROTECTION: env.SITE_PROTECTION,
      SITE_PASSWORD: env.SITE_PASSWORD,
      ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN,
      ACCESS_AUD: env.ACCESS_AUD,
      ACCESS_PATHS: env.ACCESS_PATHS,
    }),
    'Worker',
  )
  // Fails closed: Clerk keys in production with no origin to check tokens against.
  const parties = partiesConfigError(parsed, BUILD_TARGET)
  if (parties) throw new Error(`Invalid Worker environment:\n  - ${parties}`)
  cached = parsed
  return cached
})
