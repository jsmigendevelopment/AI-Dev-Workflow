import { createServerFn } from '@tanstack/react-start'
import { clerkKeys } from './auth'
import { serverEnv } from './env'

/**
 * What the browser may know about the server's setup: whether to mount Clerk, and Turnstile's
 * public site key. No secret, and nothing else.
 */
export const getPublicConfig = createServerFn({ method: 'GET' }).handler(() => ({
  authEnabled: clerkKeys() !== null,
  turnstileSiteKey: serverEnv().TURNSTILE_SITE_KEY ?? null,
}))
