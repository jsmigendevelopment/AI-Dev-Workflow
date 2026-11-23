import type { ApiClient } from '@repo/api-client'
import { createContext, useContext } from 'react'

/** The /api/v1 client for the signed-in user. Tests provide a fake through this context. */
export const ApiContext = createContext<ApiClient | null>(null)

export function useApi(): ApiClient {
  const client = useContext(ApiContext)
  if (!client) throw new Error('useApi() needs <ApiProvider> (src/components/api-provider.tsx) above it.')
  return client
}
