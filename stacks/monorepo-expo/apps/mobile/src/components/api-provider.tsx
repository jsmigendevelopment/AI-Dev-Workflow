import { createApiClient } from '@repo/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, type ReactNode } from 'react'
import { ApiContext } from '@/hooks/use-api'
import { useSession } from '@/hooks/use-session'
import { env } from '@/lib/env'

/** Builds the /api/v1 client from the session, and drops cached data when the user signs out. */
export function ApiProvider({ children, baseUrl = env.apiUrl }: { children: ReactNode; baseUrl?: string }) {
  const { getToken, status } = useSession()
  const queryClient = useQueryClient()
  const client = useMemo(() => createApiClient({ baseUrl, getToken }), [baseUrl, getToken])

  useEffect(() => {
    if (status !== 'signed-in' && status !== 'loading') queryClient.clear()
  }, [status, queryClient])

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}
