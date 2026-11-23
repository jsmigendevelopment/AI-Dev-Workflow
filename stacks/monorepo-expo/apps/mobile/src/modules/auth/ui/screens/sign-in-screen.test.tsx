import { screen, userEvent } from '@testing-library/react-native'
import { disabledSession } from '@/hooks/use-session'
import { renderWith, signedIn } from '@/test/render'
import { SignInScreen } from './sign-in-screen'

describe('SignInScreen', () => {
  it('explains that sign-in is off when there is no Clerk key, with no button to press', async () => {
    await renderWith(<SignInScreen />, { session: disabledSession })
    expect(screen.getByText(/Sign-in is not set up yet/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeOnTheScreen()
  })

  it('starts sign-in when signed out', async () => {
    const session = signedIn({ status: 'signed-out' })
    await renderWith(<SignInScreen />, { session })
    await userEvent.setup().press(screen.getByRole('button', { name: 'Sign in' }))
    expect(session.signIn).toHaveBeenCalledTimes(1)
  })

  it('says so when sign-in does not finish', async () => {
    const session = signedIn({
      status: 'signed-out',
      signIn: jest.fn().mockRejectedValue(new Error('dismissed')),
    })
    await renderWith(<SignInScreen />, { session })
    await userEvent.setup().press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Sign-in did not finish. Try again.')).toBeOnTheScreen()
  })
})
