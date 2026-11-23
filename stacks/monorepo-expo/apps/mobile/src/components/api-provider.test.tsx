import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react-native'
import { useApi } from '@/hooks/use-api'
import { SessionContext, disabledSession, type Session } from '@/hooks/use-session'
import { testQueryClient } from '@/test/render'
import { ApiProvider } from './api-provider'

function captureClient(session: Session, baseUrl?: string) {
  let api: ReturnType<typeof useApi> | undefined
  function Probe() {
    api = useApi()
    return null
  }
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <SessionContext.Provider value={session}>
        <ApiProvider baseUrl={baseUrl}>
          <Probe />
        </ApiProvider>
      </SessionContext.Provider>
    </QueryClientProvider>,
  ).then(() => api!)
}

describe('ApiProvider', () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch')
  afterEach(() => fetchSpy.mockReset())

  it('fails closed without sign-in: no request leaves the phone', async () => {
    const api = await captureClient(disabledSession, 'https://api.test')
    await expect(api.notes.list()).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends the session token as a bearer token', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { items: [], nextCursor: null } }), { status: 200 }),
    )
    const session: Session = { ...disabledSession, status: 'signed-in', getToken: async () => 'tok_123' }
    const api = await captureClient(session, 'https://api.test')
    await api.notes.list()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('https://api.test/api/v1/notes')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok_123')
  })
})
