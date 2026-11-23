import { createContext, useContext } from 'react'

/**
 * The app's view of auth. Screens and modules use this, never the Clerk SDK, so the vendor is
 * wired in one file (src/components/auth-provider.tsx) and tests need no Clerk at all.
 * - `disabled`: no publishable key; sign-in is off and every API call fails closed.
 */
export type SessionStatus = 'loading' | 'signed-in' | 'signed-out' | 'disabled'

export interface Session {
  status: SessionStatus
  /** A fresh session token for the API, or null. Never cache it: it expires within minutes. */
  getToken: () => Promise<string | null>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const disabledSession: Session = {
  status: 'disabled',
  getToken: async () => null,
  signIn: async () => {},
  signOut: async () => {},
}

export const SessionContext = createContext<Session>(disabledSession)

export const useSession = () => useContext(SessionContext)
