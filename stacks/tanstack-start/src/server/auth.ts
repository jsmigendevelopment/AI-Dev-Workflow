import { auth, clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'

import type { Actor } from '@/lib/actor'
import { type ApiResult, unauthenticated } from '@/lib/app-error'
import { bearerToken } from '@/lib/http'

import { serverEnv } from './env'

/**
 * Where auth lives. Clerk verifies the request in a request middleware (`authMiddleware`, every
 * request): the session cookie, or a session token in `Authorization: Bearer` (the header wins
 * when both are there). `withActor` turns the verified session into an Actor for server
 * functions; `bearerActor` does it for `/api/v1` routes. With no Clerk keys the app still runs,
 * and every call fails closed as `unauthenticated`.
 *
 * This file is also bundled for the browser (start.ts and server functions import it), so every
 * server-only call sits inside `.server()` or `createServerOnlyFn`, which the compiler strips there.
 */

/** Read per request, never at module scope. Validated in src/lib/env-schema.ts. */
export const clerkKeys = createServerOnlyFn(() => {
  const { CLERK_SECRET_KEY: secretKey, CLERK_PUBLISHABLE_KEY: publishableKey, CLERK_JWT_KEY } = serverEnv()
  if (!secretKey || !publishableKey) return null
  // With the instance's PEM public key, tokens are verified with no call to Clerk (networkless).
  return CLERK_JWT_KEY ? { secretKey, publishableKey, jwtKey: CLERK_JWT_KEY } : { secretKey, publishableKey }
})

/** Request middleware: runs Clerk when it's configured, and steps aside when it isn't. */
export const authMiddleware = createMiddleware().server((args) => {
  const keys = clerkKeys()
  const run = keys ? clerkMiddleware(keys).options.server : undefined
  return run ? run(args) : args.next()
})

/** Function middleware: puts the verified actor (or null) on the server function's context. */
export const withActor = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  let actor: Actor | null = null
  if (clerkKeys()) {
    const { userId } = await auth()
    if (userId) actor = { userId }
  }
  return next({ context: { actor } })
})

/**
 * The actor for an `/api/v1` route: a Clerk session token sent as `Authorization: Bearer`, which
 * `authMiddleware` already verified (signature, expiry, issuer). Only the header counts, never
 * the cookie, so a cross-site page can't use a signed-in browser's session here (no CSRF check
 * needed). `auth()` accepts session tokens only: an API key or M2M token reads as signed out.
 */
export const bearerActor = createServerOnlyFn(async (request: Request): Promise<Actor | null> => {
  if (!bearerToken(request) || !clerkKeys()) return null
  const { userId } = await auth()
  return userId ? { userId } : null
})

/** Refuses anonymous callers with the same envelope every other failure uses. */
export function asActor<T>(
  actor: Actor | null,
  run: (actor: Actor) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  return actor ? run(actor) : Promise.resolve(unauthenticated())
}
