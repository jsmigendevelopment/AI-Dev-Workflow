import { ClerkProvider, useAuth } from '@clerk/expo'
import { useHostedAuth } from '@clerk/expo/hosted-auth'
import { tokenCache } from '@clerk/expo/token-cache'
import { useMemo, type ReactNode } from 'react'
import { SessionContext, disabledSession, type Session } from '@/hooks/use-session'

/**
 * The only file that imports Clerk (lint enforces it). With no publishable key, sign-in is off:
 * the session is `disabled`, getToken() returns null and every API call fails closed.
 * Sign-in uses Clerk's hosted Account Portal in an in-app browser: least code, every sign-in
 * method the Clerk app enables, and it works in Expo Go. Native components are beta.
 */
export function AuthProvider({
  publishableKey,
  children,
}: {
  publishableKey: string | undefined
  children: ReactNode
}) {
  if (!publishableKey)
    return <SessionContext.Provider value={disabledSession}>{children}</SessionContext.Provider>
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkSession>{children}</ClerkSession>
    </ClerkProvider>
  )
}

function ClerkSession({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth()
  const { startHostedAuth } = useHostedAuth()

  const session = useMemo<Session>(
    () => ({
      status: !isLoaded ? 'loading' : isSignedIn ? 'signed-in' : 'signed-out',
      getToken: () => getToken(),
      signIn: async () => {
        await startHostedAuth({ mode: 'sign-in' })
      },
      signOut: () => signOut(),
    }),
    [isLoaded, isSignedIn, getToken, signOut, startHostedAuth],
  )

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
