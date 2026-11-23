import * as z from 'zod'

// Public build-time settings. Expo inlines `process.env.EXPO_PUBLIC_*` into the bundle, so these
// are visible to anyone with the app: never put a secret here. Each one must be read with its full
// name (no destructuring) or Expo can't inline it.
const schema = z.object({
  apiUrl: z.url({ protocol: /^https?$/ }).optional(),
  clerkPublishableKey: z
    .string()
    .regex(/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/)
    .optional(),
})
export type Env = z.infer<typeof schema>

const NAMES: Record<keyof Env, string> = {
  apiUrl: 'EXPO_PUBLIC_API_URL',
  clerkPublishableKey: 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
}

/**
 * A missing or malformed value turns its feature off (fails closed) instead of crashing the app.
 * `problems` names the bad variables, never their values.
 */
export function readEnv(raw: Record<keyof Env, string | undefined>): Env & { problems: string[] } {
  const env: Env = {}
  const problems: string[] = []
  for (const key of Object.keys(NAMES) as (keyof Env)[]) {
    const value = raw[key]?.trim() || undefined
    const parsed = schema.shape[key].safeParse(value)
    if (parsed.success) env[key] = parsed.data
    else problems.push(`${NAMES[key]} is not valid`)
  }
  return { ...env, problems }
}

export const env = readEnv({
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
})

if (env.problems.length > 0) console.warn(`[env] ${env.problems.join('; ')}. That feature is off.`)
