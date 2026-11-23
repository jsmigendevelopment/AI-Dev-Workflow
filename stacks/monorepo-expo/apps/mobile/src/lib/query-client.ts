import { isApiError } from '@repo/api-client'
import { QueryClient } from '@tanstack/react-query'

// Errors the user or the server must fix: retrying them only repeats the failure.
const NO_RETRY = new Set([
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'too_large',
  'rate_limited',
])

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => !(isApiError(error) && NO_RETRY.has(error.code)) && count < 2,
      },
      mutations: { retry: false },
    },
  })
}
