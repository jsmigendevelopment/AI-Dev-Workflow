import '../global.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { ApiProvider } from '@/components/api-provider'
import { AuthProvider } from '@/components/auth-provider'
import { SignOutButton } from '@/components/sign-out-button'
import { env } from '@/lib/env'
import { createQueryClient } from '@/lib/query-client'

export default function RootLayout() {
  // One cache per app run, created on first render.
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider publishableKey={env.clerkPublishableKey}>
        <ApiProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerRight: () => <SignOutButton /> }} />
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
