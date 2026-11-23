import { Show, SignInButton, UserButton } from '@clerk/tanstack-react-start'
import { Button } from '@/components/ui/button'
import { useAuthEnabled } from '@/hooks/use-auth-enabled'

export function AuthControls() {
  if (!useAuthEnabled())
    return <span className="text-muted-foreground text-sm">Sign-in is not set up yet</span>
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
