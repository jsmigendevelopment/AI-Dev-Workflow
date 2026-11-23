// Route tests live here, not in src/app: Expo Router would treat a file in src/app as a route.
import { QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react-native'
import { Slot } from 'expo-router'
import { renderRouter } from 'expo-router/testing-library'
import HomeRoute from '@/app/index'
import { ApiContext } from '@/hooks/use-api'
import { SessionContext, disabledSession, type Session } from '@/hooks/use-session'
import { fakeApi, testQueryClient } from './render'

function layoutWith(session: Session) {
  const api = fakeApi({ notes: { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) } })
  const queryClient = testQueryClient()
  return function TestLayout() {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={session}>
          <ApiContext.Provider value={api}>
            <Slot />
          </ApiContext.Provider>
        </SessionContext.Provider>
      </QueryClientProvider>
    )
  }
}

describe('home route', () => {
  it('shows sign-in when sign-in is not configured (fails closed)', async () => {
    await renderRouter({ _layout: layoutWith(disabledSession), index: HomeRoute })
    expect(await screen.findByText('Sign in to see your notes')).toBeOnTheScreen()
  })

  it('shows sign-in when signed out', async () => {
    await renderRouter({
      _layout: layoutWith({ ...disabledSession, status: 'signed-out' }),
      index: HomeRoute,
    })
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeOnTheScreen()
  })

  it('shows the notes screen when signed in', async () => {
    const session: Session = { ...disabledSession, status: 'signed-in', getToken: async () => 't' }
    await renderRouter({ _layout: layoutWith(session), index: HomeRoute })
    expect(await screen.findByText('No notes yet')).toBeOnTheScreen()
  })
})
