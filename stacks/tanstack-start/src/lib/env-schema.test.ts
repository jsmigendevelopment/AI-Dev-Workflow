import { describe, expect, it } from 'vitest'
import { buildEnvSchema, parseEnv, runtimeEnvSchema } from './env-schema'

const run = (raw: Record<string, string | undefined>) => () => parseEnv(runtimeEnvSchema, raw, 'Worker')

describe('env schema', () => {
  it('accepts a fresh clone with no keys at all', () => {
    expect(run({})()).toEqual({})
    expect(run({ CLERK_SECRET_KEY: '', CLERK_PUBLISHABLE_KEY: '  ' })()).toEqual({})
  })

  it('accepts a complete pair', () => {
    expect(run({ CLERK_PUBLISHABLE_KEY: 'pk_test_abc', CLERK_SECRET_KEY: 'sk_test_abc' })()).toMatchObject({
      CLERK_SECRET_KEY: 'sk_test_abc',
    })
  })

  it('fails fast on a half-set pair, naming the missing variable and never printing a value', () => {
    const secret = 'sk_live_DO_NOT_PRINT_ME'
    expect(run({ CLERK_SECRET_KEY: secret })).toThrow(/CLERK_PUBLISHABLE_KEY is missing/)
    try {
      run({ CLERK_SECRET_KEY: secret, TURNSTILE_SITE_KEY: 'x' })()
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('TURNSTILE_SITE_KEY')
      expect(message).not.toContain(secret)
      expect(message).not.toContain('DO_NOT_PRINT')
    }
  })

  it('rejects a malformed key without echoing it', () => {
    expect(run({ CLERK_SECRET_KEY: 'oops-secret', CLERK_PUBLISHABLE_KEY: 'pk_x' })).toThrow(
      /CLERK_SECRET_KEY must start with sk_/,
    )
    expect(run({ CLERK_SECRET_KEY: 'oops-secret', CLERK_PUBLISHABLE_KEY: 'pk_x' })).not.toThrow(/oops-secret/)
  })

  it('takes an optional Clerk JWT public key, only with the Clerk keys', () => {
    const keys = { CLERK_PUBLISHABLE_KEY: 'pk_test_abc', CLERK_SECRET_KEY: 'sk_test_abc' }
    const pem = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----'
    expect(run({ ...keys, CLERK_JWT_KEY: pem })().CLERK_JWT_KEY).toBe(pem)
    expect(run({ ...keys, CLERK_JWT_KEY: 'not-a-key' })).toThrow(/CLERK_JWT_KEY must be a PEM public key/)
    expect(run({ CLERK_JWT_KEY: pem })).toThrow(/CLERK_JWT_KEY needs CLERK_SECRET_KEY too/)
  })

  it('takes LAUNCHED and SITE_PROTECTION only as their exact values', () => {
    expect(run({ LAUNCHED: 'false', SITE_PROTECTION: 'access' })()).toEqual({
      LAUNCHED: 'false',
      SITE_PROTECTION: 'access',
    })
    expect(run({ LAUNCHED: 'yes' })).toThrow(/LAUNCHED must be "true" or "false"/)
    expect(run({ SITE_PROTECTION: 'basic' })).toThrow(
      /SITE_PROTECTION must be "access", "password" or "none"/,
    )
  })

  it('needs a long random SITE_PASSWORD for the password gate, never echoing it', () => {
    const password = 'k3Vq9XbT0wLr7NpZs2YhAe5D'
    expect(run({ SITE_PROTECTION: 'password', SITE_PASSWORD: password })().SITE_PASSWORD).toBe(password)
    expect(run({ SITE_PROTECTION: 'password' })).toThrow(/SITE_PASSWORD is missing/)
    expect(run({ SITE_PROTECTION: 'password', SITE_PASSWORD: 'my-app' })).toThrow(/SITE_PASSWORD must be/)
    expect(run({ SITE_PROTECTION: 'password', SITE_PASSWORD: 'my-app' })).not.toThrow(/my-app/)
  })

  it('checks the build-time site URL', () => {
    expect(parseEnv(buildEnvSchema, {}, 'build')).toEqual({})
    expect(parseEnv(buildEnvSchema, { SITE_URL: 'https://app.example.com' }, 'build').SITE_URL).toBe(
      'https://app.example.com',
    )
    expect(() => parseEnv(buildEnvSchema, { SITE_URL: 'https://app.example.com/' }, 'build')).toThrow(
      /SITE_URL must not end with a slash/,
    )
    expect(() => parseEnv(buildEnvSchema, { SITE_URL: 'app.example.com' }, 'build')).toThrow(/SITE_URL/)
  })
})
