import { useState } from 'react'
import { Text, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { useSession } from '@/hooks/use-session'

/** Shown whenever there is no signed-in user, including when sign-in isn't configured. */
export function SignInScreen() {
  const session = useSession()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    setFailed(false)
    setBusy(true)
    try {
      await session.signIn()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Text role="heading" className="text-2xl font-bold text-foreground">
          Sign in to see your notes
        </Text>
        {session.status === 'disabled' ? (
          <Text className="text-muted">
            Sign-in is not set up yet. Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to apps/mobile/.env and restart.
          </Text>
        ) : (
          <>
            <Button label="Sign in" onPress={() => void signIn()} busy={busy} />
            {failed ? (
              <Text role="alert" className="text-danger">
                Sign-in did not finish. Try again.
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  )
}
