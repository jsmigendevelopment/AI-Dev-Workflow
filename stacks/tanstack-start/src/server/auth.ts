import { auth, clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'

import type { Actor } from '@/lib/actor'
import { type ApiResult, unauthenticated } from '@/lib/app-error'
import { authorizedParties, isNativeBearer, NO_PARTY, requestForClerk } from '@/lib/authorized-parties'
import { BUILD_TARGET } from '@/lib/build-target'
import { bearerToken } from '@/lib/http'
import { logger } from '@/lib/logger'

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

let warnedNoParty = false

/**
 * The origins this request's session token may come from (src/lib/authorized-parties.ts). Same
 * list for the cookie and the bearer header, since both pass through `authenticateRequest`.
 */
const partiesFor = createServerOnlyFn((request: Request): string[] => {
  const url = new URL(request.url)
  const parties = authorizedParties(url, BUILD_TARGET, serverEnv().CLERK_AUTHORIZED_PARTIES)
  if (parties[0] === NO_PARTY && !warnedNoParty) {
    warnedNoParty = true
    logger.warn('clerk_no_authorized_party', { host: url.host })
  }
  return parties
})

// Clerk says why a token was refused (and, for a wrong `azp`, every allowed origin) in response
// headers, on a handshake redirect too, and in the page's `__clerk_init_state.__clerk_debug`.
// Every refusal must look the same from outside: the reason goes to the log instead.
const DEBUG_HEADERS = ['x-clerk-auth-reason', 'x-clerk-auth-message']

function withoutDebugHeaders(response: Response): void {
  const reason = response.headers.get('x-clerk-auth-reason')
  if (reason === 'token-invalid-authorized-parties') logger.warn('clerk_token_refused', { reason })
  // Mutable: Clerk has just appended its own headers to this same object.
  for (const name of DEBUG_HEADERS) response.headers.delete(name)
}

interface ClerkContext {
  clerkInitialState?: { __internal_clerk_state?: { __clerk_debug?: Record<string, unknown> } }
}

function withoutDebugState(context: unknown): void {
  const debug = (context as ClerkContext | undefined)?.clerkInitialState?.__internal_clerk_state
    ?.__clerk_debug
  if (debug) {
    delete debug.reason
    delete debug.message
  }
}

const clerkOptions = createServerOnlyFn((request: Request) => {
  const keys = clerkKeys()
  if (!keys) return undefined
  // A native app's token has no `azp`: verified without the list, only where the app opted in.
  if (isNativeBearer(request, serverEnv().CLERK_ALLOW_NATIVE_TOKENS === 'true')) return keys
  return { ...keys, authorizedParties: partiesFor(request) }
})

/**
 * Request middleware: runs Clerk when it's configured, and steps aside when it isn't. Clerk
 * checks the token's `azp` against `authorizedParties`; a token without `azp` is refused too.
 */
export const authMiddleware = createMiddleware().server(async (args) => {
  const options = clerkOptions(args.request)
  const run = options ? clerkMiddleware(options).options.server : undefined
  if (!run) return args.next()
  const next: typeof args.next = (opts) => {
    withoutDebugState(opts?.context)
    return args.next(opts)
  }
  try {
    const result = await run({ ...args, request: requestForClerk(args.request), next })
    withoutDebugHeaders(result instanceof Response ? result : result.response)
    return result
  } catch (thrown) {
    // Clerk throws its handshake redirect (a 307) as a Response.
    if (thrown instanceof Response) withoutDebugHeaders(thrown)
    throw thrown
  }
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
 * `authMiddleware` already verified (signature, expiry, authorized party). Only the header counts, never
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
