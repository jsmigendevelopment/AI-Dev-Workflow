import { useSession } from '@/hooks/use-session'
import { Button } from './ui/button'

export function SignOutButton() {
  const session = useSession()
  if (session.status !== 'signed-in') return null
  return <Button label="Sign out" variant="ghost" onPress={() => void session.signOut()} />
}
