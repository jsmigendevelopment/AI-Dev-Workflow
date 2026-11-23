import { readEnv } from './env'

describe('readEnv', () => {
  it('reads valid values', () => {
    expect(readEnv({ apiUrl: 'https://app.example.com', clerkPublishableKey: 'pk_test_abc123' })).toEqual({
      apiUrl: 'https://app.example.com',
      clerkPublishableKey: 'pk_test_abc123',
      problems: [],
    })
  })

  it('treats empty values as not set', () => {
    expect(readEnv({ apiUrl: '', clerkPublishableKey: '  ' })).toEqual({ problems: [] })
  })

  it('turns a malformed value off and names it without its value', () => {
    const env = readEnv({ apiUrl: 'ftp://nope', clerkPublishableKey: 'sk_test_secret' })
    expect(env.apiUrl).toBeUndefined()
    expect(env.clerkPublishableKey).toBeUndefined()
    expect(env.problems).toEqual([
      'EXPO_PUBLIC_API_URL is not valid',
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not valid',
    ])
    expect(env.problems.join(' ')).not.toContain('sk_test_secret')
  })
})
