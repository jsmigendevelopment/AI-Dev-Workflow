import { lazy, Suspense, type ReactNode } from 'react'
import { PublicConfigContext, type PublicConfig } from '@/hooks/use-public-config'

const ClerkRoot = lazy(() => import('./clerk').then((m) => ({ default: m.ClerkRoot })))

/**
 * Mounts Clerk only when the server has its keys, so the app runs without an account and ships
 * no Clerk code until it has one. With keys, the server renders the page and the browser keeps
 * that HTML until Clerk's chunk arrives, then hydrates.
 */
export function AuthProvider({ config, children }: { config: PublicConfig; children: ReactNode }) {
  return (
    <PublicConfigContext value={config}>
      {config.authEnabled ? (
        <Suspense>
          <ClerkRoot>{children}</ClerkRoot>
        </Suspense>
      ) : (
        children
      )}
    </PublicConfigContext>
  )
}
