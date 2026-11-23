import type { ApiClient } from '@repo/api-client'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { ApiContext } from '@/hooks/use-api'
import { SessionContext, type Session } from '@/hooks/use-session'
import { createQueryClient } from '@/lib/query-client'

type FakeApi = { [K in keyof ApiClient]?: Partial<ApiClient[K]> }

/** A fake /api/v1 client. A method the test didn't set rejects, so a stray call fails the test. */
export function fakeApi(overrides: FakeApi = {}): ApiClient {
  const unexpected = (name: string) =>
    jest.fn(() => Promise.reject(new Error(`Unexpected API call: ${name}`)))
  return {
    notes: {
      list: unexpected('notes.list'),
      create: unexpected('notes.create'),
      rename: unexpected('notes.rename'),
      remove: unexpected('notes.remove'),
      ...overrides.notes,
    },
  }
}

export const signedIn = (overrides: Partial<Session> = {}): Session => ({
  status: 'signed-in',
  getToken: async () => 'test-token',
  signIn: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
  ...overrides,
})

/** The app's query client, minus retries and garbage-collection timers (which keep Jest alive). */
export function testQueryClient() {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({
    queries: { retry: false, staleTime: 0, gcTime: Infinity },
    mutations: { retry: false, gcTime: Infinity },
  })
  return queryClient
}

/** Render with a fresh query cache, a session and a fake API. */
export function renderWith(
  ui: ReactElement,
  { api = fakeApi(), session = signedIn() }: { api?: ApiClient; session?: Session } = {},
) {
  const queryClient = testQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={session}>
        <ApiContext.Provider value={api}>{ui}</ApiContext.Provider>
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
}
