import { createServerFn } from '@tanstack/react-start'
import { clerkKeys } from './auth'

/** Tells the UI whether to mount Clerk. Holds no secret: only a yes or no. */
export const getAuthConfig = createServerFn({ method: 'GET' }).handler(() => ({
  enabled: clerkKeys() !== null,
}))
