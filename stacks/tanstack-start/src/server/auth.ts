import { auth, clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import type { Actor } from '@/lib/actor'
import { unauthenticated, type ApiResult } from '@/lib/app-error'

/**
 * Where auth lives. Clerk verifies the session cookie in a request middleware; `withActor` turns
 * the verified session into an Actor for server functions. With no Clerk keys the app still runs,
 * and every call fails closed as `unauthenticated`.
 *
 * This file is also bundled for the browser (start.ts and server functions import it), so every
 * server-only call sits inside `.server()` or `createServerOnlyFn`, which the compiler strips there.
 */

/** Read per request, never at module scope. */
export const clerkKeys = createServerOnlyFn(() => {
  const secretKey = env.CLERK_SECRET_KEY
  const publishableKey = env.CLERK_PUBLISHABLE_KEY
  return secretKey && publishableKey ? { secretKey, publishableKey } : null
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

/** Refuses anonymous callers with the same envelope every other failure uses. */
export function asActor<T>(
  actor: Actor | null,
  run: (actor: Actor) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  return actor ? run(actor) : Promise.resolve(unauthenticated())
}
