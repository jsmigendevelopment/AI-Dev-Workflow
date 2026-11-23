import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'

import type { ApiResult } from '@/lib/app-error'
import { type HumanCheck, TURNSTILE_HEADER, verifyTurnstile } from '@/lib/turnstile'

import { serverEnv } from './env'

/**
 * Turnstile, ready and off. With no TURNSTILE_* keys nothing loads and every check passes. With
 * keys, a form that uses `useTurnstile()` sends a token in this header, and `withHumanCheck`
 * verifies it with Cloudflare before the handler runs. Add Turnstile to a form only when counters
 * show the cheaper layers (rate limit, caps, CSRF) are not enough.
 */
const check = createServerOnlyFn(async (): Promise<HumanCheck> => {
  const secret = serverEnv().TURNSTILE_SECRET_KEY
  if (!secret) return 'passed'
  const host = getRequestHeader('host') ?? ''
  return verifyTurnstile({
    secret,
    token: getRequestHeader(TURNSTILE_HEADER),
    remoteIp: getRequestHeader('cf-connecting-ip'),
    expectedHost: host.replace(/:\d+$/, ''),
  })
})

/** Function middleware: puts the verdict on the context. The handler decides with `asHuman`. */
export const withHumanCheck = createMiddleware({ type: 'function' }).server(async ({ next }) =>
  next({ context: { human: await check() } }),
)

export function asHuman<T>(human: HumanCheck, run: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  if (human === 'passed') return run()
  return Promise.resolve({
    ok: false,
    error: { code: 'forbidden', message: 'We could not confirm you are a person. Try again.' },
  })
}
