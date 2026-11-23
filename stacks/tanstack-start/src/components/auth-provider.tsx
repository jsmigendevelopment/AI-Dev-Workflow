import { ClerkProvider } from '@clerk/tanstack-react-start'
import type { ReactNode } from 'react'
import { AuthEnabledContext } from '@/hooks/use-auth-enabled'

/** Mounts Clerk only when the server has its keys, so the app runs without an account. */
export function AuthProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return (
    <AuthEnabledContext value={enabled}>
      {enabled ? <ClerkProvider>{children}</ClerkProvider> : children}
    </AuthEnabledContext>
  )
}
