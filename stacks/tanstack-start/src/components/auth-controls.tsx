import { lazy, Suspense } from 'react'
import { useAuthEnabled } from '@/hooks/use-public-config'

const ClerkControls = lazy(() => import('./clerk').then((m) => ({ default: m.ClerkControls })))

export function AuthControls() {
  if (!useAuthEnabled())
    return <span className="text-muted-foreground text-sm">Sign-in is not set up yet</span>
  return (
    <Suspense>
      <ClerkControls />
    </Suspense>
  )
}
