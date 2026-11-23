import { Stack } from 'expo-router'
import { LoadingState } from '@/components/states'
import { useSession } from '@/hooks/use-session'
import { SignInScreen } from '@/modules/auth/ui/screens/sign-in-screen'
import { NotesScreen } from '@/modules/notes/ui/screens/notes-screen'

/** Thin route: picks a module's screen from the session. Signed out or no keys → sign-in. */
export default function HomeRoute() {
  const { status } = useSession()
  return (
    <>
      <Stack.Screen options={{ title: status === 'signed-in' ? 'Notes' : 'Welcome' }} />
      {status === 'loading' ? <LoadingState /> : status === 'signed-in' ? <NotesScreen /> : <SignInScreen />}
    </>
  )
}
