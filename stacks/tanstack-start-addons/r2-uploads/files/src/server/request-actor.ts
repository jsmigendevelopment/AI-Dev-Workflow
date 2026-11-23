import { auth } from '@clerk/tanstack-react-start/server'
import type { Actor } from '@/lib/actor'
import { clerkKeys } from './auth'

/**
 * The actor for a server route. Server routes skip function middleware (`withActor`), so they
 * call this. Same rule: no Clerk keys, no actor, and the route answers 401.
 */
export async function requestActor(): Promise<Actor | null> {
  if (!clerkKeys()) return null
  const { userId } = await auth()
  return userId ? { userId } : null
}
