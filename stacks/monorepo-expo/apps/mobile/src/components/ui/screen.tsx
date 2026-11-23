import type { ReactNode } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'

/** The page container: safe areas, theme background, side padding. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-background px-4 pt-4">
      {children}
    </SafeAreaView>
  )
}
