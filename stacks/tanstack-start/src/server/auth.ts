import { auth, clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'

import type { Actor } from '@/lib/actor'
import { type ApiResult, unauthenticated } from '@/lib/app-error'
import {
  authorizedParties,
  isApiRedirect,
  isNativeBearer,
  nativeClaimMissing,
  NO_PARTY,
  requestForClerk,
} from '@/lib/authorized-parties'
import { BUILD_TARGET } from '@/lib/build-target'
import { clerkFrontendOrigins, leavesAllowedOrigins, refusedRedirect } from '@/lib/clerk-redirects'
import { bearerToken, envelopeResponse } from '@/lib/http'
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
  const {
    CLERK_SECRET_KEY: secretKey,
    VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
    CLERK_JWT_KEY,
  } = serverEnv()
  if (!secretKey || !publishableKey) return null
  // With the instance's PEM public key, tokens are verified with no call to Clerk (networkless).
  return CLERK_JWT_KEY ? { secretKey, publishableKey, jwtKey: CLERK_JWT_KEY } : { secretKey, publishableKey }
})

let warnedNoParty = false
let warnedNoClaim = false

/**
 * The origins this request's session token may come from (src/lib/authorized-parties.ts). Same
 * list for the cookie and the bearer header, since both pass through `authenticateRequest`, and
 * the only origins a Clerk redirect target may name (src/server/request-guards.ts).
 */
export const partiesFor = createServerOnlyFn((request: Request): string[] => {
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
  const env = serverEnv()
  // Fails closed: native tokens allowed but no claim to check means no native path at all.
  if (nativeClaimMissing(env) && !warnedNoClaim) {
    warnedNoClaim = true
    logger.warn('clerk_native_claim_missing', { variable: 'CLERK_NATIVE_APP_CLAIM' })
  }
  // A native app's token has no `azp`: verified without the list only where the app opted in and
  // the token carries our `app` claim. Without it, the list refuses the token like any other.
  if (isNativeBearer(request, env)) return keys
  return { ...keys, authorizedParties: partiesFor(request) }
})

/**
 * True when Clerk's own redirect (thrown before the app ran) leaves the authorized parties and
 * Clerk's Frontend API, or sends Clerk's handshake back anywhere but the parties (#66). Belt and
 * braces: the guards refuse a foreign `__clerk_redirect_url` and requestForClerk drops the proxy
 * headers Clerk would build a foreign URL from.
 */
const clerkLeavesSite = createServerOnlyFn((request: Request, redirect: Response): boolean => {
  const allowed = {
    parties: partiesFor(request),
    frontendApi: clerkFrontendOrigins(serverEnv().VITE_CLERK_PUBLISHABLE_KEY),
  }
  if (!leavesAllowedOrigins(redirect, new URL(request.url), allowed)) return false
  logger.warn('clerk_redirect_refused', { status: redirect.status })
  return true
})

/**
 * Request middleware: runs Clerk when it's configured, and steps aside when it isn't. Clerk
 * checks the token's `azp` against `authorizedParties`; a token without `azp` is refused too.
 */
export const authMiddleware = createMiddleware().server(async (args) => {
  const options = clerkOptions(args.request)
  const run = options ? clerkMiddleware(options).options.server : undefined
  if (!run) return args.next()
  // A Response thrown before Clerk calls `next` is Clerk's own redirect; later ones are the app's.
  let reachedApp = false
  const next: typeof args.next = (opts) => {
    reachedApp = true
    withoutDebugState(opts?.context)
    return args.next(opts)
  }
  try {
    const result = await run({ ...args, request: requestForClerk(args.request), next })
    const response = result instanceof Response ? result : result.response
    withoutDebugHeaders(response)
    // Belt and braces: requestForClerk already drops what makes Clerk redirect on the API.
    return isApiRedirect(args.request, response) ? envelopeResponse(unauthenticated()) : result
  } catch (thrown) {
    // Clerk throws its handshake redirect (a 307) as a Response.
    if (!(thrown instanceof Response)) throw thrown
    withoutDebugHeaders(thrown)
    if (isApiRedirect(args.request, thrown)) return envelopeResponse(unauthenticated())
    if (!reachedApp && clerkLeavesSite(args.request, thrown))
      return refusedRedirect(args.handlerType === 'serverFn')
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
