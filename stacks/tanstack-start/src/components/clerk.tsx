import { ClerkProvider, Show, SignInButton, UserButton } from '@clerk/tanstack-react-start'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

// Everything that touches Clerk's SDK lives in this one module, loaded with React.lazy only when
// Clerk keys are set. Without keys the app ships none of it (about 35 KB gzip in 2026-11).

export function ClerkRoot({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>
}

export function ClerkControls() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button size="sm">Sign in</Button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  )
}
