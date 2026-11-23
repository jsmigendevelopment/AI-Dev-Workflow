import { ActivityIndicator, Text, View } from 'react-native'
import { Button } from './ui/button'

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center" accessibilityLabel={label}>
      <ActivityIndicator size="large" />
    </View>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View className="items-center gap-1 py-12">
      <Text role="heading" className="text-lg font-semibold text-foreground">
        {title}
      </Text>
      {body ? <Text className="text-center text-muted">{body}</Text> : null}
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="items-center gap-3 py-12" role="alert">
      <Text className="text-center text-foreground">{message}</Text>
      {onRetry ? <Button label="Try again" variant="ghost" onPress={onRetry} /> : null}
    </View>
  )
}
