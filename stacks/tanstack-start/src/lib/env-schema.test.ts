import { describe, expect, it, vi } from 'vitest'

import { buildEnvSchema, envAliases, parseEnv, runtimeEnvSchema } from './env-schema'

const run = (raw: Record<string, string | undefined>) => () => parseEnv(runtimeEnvSchema, raw, 'Worker')

describe('env schema', () => {
  it('accepts a fresh clone with no keys at all', () => {
    expect(run({})()).toEqual({})
    expect(run({ CLERK_SECRET_KEY: '', VITE_CLERK_PUBLISHABLE_KEY: '  ' })()).toEqual({})
  })

  it('accepts a complete pair', () => {
    expect(
      run({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_abc', CLERK_SECRET_KEY: 'sk_test_abc' })(),
    ).toMatchObject({
      CLERK_SECRET_KEY: 'sk_test_abc',
    })
  })

  it('fails fast on a half-set pair, naming the missing variable and never printing a value', () => {
    const secret = 'sk_live_DO_NOT_PRINT_ME'
    expect(run({ CLERK_SECRET_KEY: secret })).toThrow(/VITE_CLERK_PUBLISHABLE_KEY is missing/)
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
    expect(run({ CLERK_SECRET_KEY: 'oops-secret', VITE_CLERK_PUBLISHABLE_KEY: 'pk_x' })).toThrow(
      /CLERK_SECRET_KEY must start with sk_/,
    )
    expect(run({ CLERK_SECRET_KEY: 'oops-secret', VITE_CLERK_PUBLISHABLE_KEY: 'pk_x' })).not.toThrow(
      /oops-secret/,
    )
  })

  it('takes an optional Clerk JWT public key, only with the Clerk keys', () => {
    const keys = { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_abc', CLERK_SECRET_KEY: 'sk_test_abc' }
    const pem = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----'
    expect(run({ ...keys, CLERK_JWT_KEY: pem })().CLERK_JWT_KEY).toBe(pem)
    expect(run({ ...keys, CLERK_JWT_KEY: 'not-a-key' })).toThrow(/CLERK_JWT_KEY must be a PEM public key/)
    expect(run({ CLERK_JWT_KEY: pem })).toThrow(/CLERK_JWT_KEY needs CLERK_SECRET_KEY too/)
  })

  it('takes CLERK_AUTHORIZED_PARTIES only as exact origins, never a pattern or a path', () => {
    const ok = 'https://app.example.com,https://www.example.com, http://localhost:3000'
    expect(run({ CLERK_AUTHORIZED_PARTIES: ok })().CLERK_AUTHORIZED_PARTIES).toBe(ok)
    for (const bad of [
      'https://*.example.com',
      'https://app.example.com/',
      'https://app.example.com/path',
      'app.example.com',
      '*',
      'https://app.example.com,,https://b.example.com',
      'https://App.Example.com',
    ])
      expect(run({ CLERK_AUTHORIZED_PARTIES: bad }), bad).toThrow(/CLERK_AUTHORIZED_PARTIES must be/)
  })

  it('takes CLERK_ALLOW_NATIVE_TOKENS only as "true" or "false"', () => {
    expect(run({ CLERK_ALLOW_NATIVE_TOKENS: 'true' })().CLERK_ALLOW_NATIVE_TOKENS).toBe('true')
    expect(run({ CLERK_ALLOW_NATIVE_TOKENS: 'yes' })).toThrow(/CLERK_ALLOW_NATIVE_TOKENS must be/)
  })

  it('takes CLERK_NATIVE_APP_CLAIM only as a short lowercase name', () => {
    expect(run({ CLERK_NATIVE_APP_CLAIM: 'my-app.mobile' })().CLERK_NATIVE_APP_CLAIM).toBe('my-app.mobile')
    for (const bad of ['My App', '-app', 'a'.repeat(65), 'app,other'])
      expect(run({ CLERK_NATIVE_APP_CLAIM: bad }), bad).toThrow(/CLERK_NATIVE_APP_CLAIM must be/)
  })

  it('takes LAUNCHED and SITE_PROTECTION only as their exact values', () => {
    expect(
      run({ LAUNCHED: 'false', SITE_PROTECTION: 'password', SITE_PASSWORD: 'k3Vq9XbT0wLr7NpZs2YhAe5D' })(),
    ).toEqual({
      LAUNCHED: 'false',
      SITE_PROTECTION: 'password',
      SITE_PASSWORD: 'k3Vq9XbT0wLr7NpZs2YhAe5D',
    })
    expect(run({ SITE_PROTECTION: 'none' })()).toEqual({ SITE_PROTECTION: 'none' })
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

  it('needs the team domain and AUD with Cloudflare Access, and checks their shape', () => {
    const access = {
      SITE_PROTECTION: 'access',
      ACCESS_TEAM_DOMAIN: 'https://ann.cloudflareaccess.com',
      ACCESS_AUD: 'f'.repeat(64),
    }
    expect(run(access)()).toMatchObject(access)
    expect(run({ ...access, ACCESS_PATHS: '/admin/*,/ops' })().ACCESS_PATHS).toBe('/admin/*,/ops')
    expect(run({ SITE_PROTECTION: 'access' })).toThrow(/ACCESS_TEAM_DOMAIN is missing/)
    expect(run({ SITE_PROTECTION: 'access' })).toThrow(/ACCESS_AUD is missing/)
    expect(run({ ...access, ACCESS_TEAM_DOMAIN: 'https://evil.example.com' })).toThrow(
      /ACCESS_TEAM_DOMAIN must be/,
    )
    expect(run({ ...access, ACCESS_AUD: 'not hex' })).toThrow(/ACCESS_AUD must be/)
    expect(run({ ...access, ACCESS_PATHS: 'admin' })).toThrow(/ACCESS_PATHS must be/)
  })

  // #13: Clerk's CLI (`clerk env pull`) and its TanStack Start quickstart name the publishable key
  // VITE_CLERK_PUBLISHABLE_KEY; apps set up before that keep CLERK_PUBLISHABLE_KEY working.
  describe('the old CLERK_PUBLISHABLE_KEY name', () => {
    const pk = 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk'

    it('is read as VITE_CLERK_PUBLISHABLE_KEY, with a warning that names both and no value', () => {
      const warn = vi.fn()
      const raw = envAliases(warn)({ CLERK_PUBLISHABLE_KEY: pk, CLERK_SECRET_KEY: 'sk_test_abc' })
      expect(run(raw)()).toMatchObject({ VITE_CLERK_PUBLISHABLE_KEY: pk, CLERK_SECRET_KEY: 'sk_test_abc' })
      expect(raw).not.toHaveProperty('CLERK_PUBLISHABLE_KEY')
      expect(warn).toHaveBeenCalledExactlyOnceWith('CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_PUBLISHABLE_KEY')
      expect(JSON.stringify(warn.mock.calls)).not.toContain(pk)
    })

    it('warns once, however many times the env is read', () => {
      const warn = vi.fn()
      const read = envAliases(warn)
      for (let i = 0; i < 3; i++) read({ CLERK_PUBLISHABLE_KEY: pk })
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('loses to the documented name when both are set, still warning', () => {
      const warn = vi.fn()
      const raw = envAliases(warn)({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_new', CLERK_PUBLISHABLE_KEY: pk })
      expect(raw).toEqual({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_new' })
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('changes nothing and says nothing when only the documented name is set, or the old one is blank', () => {
      const warn = vi.fn()
      const read = envAliases(warn)
      expect(read({ VITE_CLERK_PUBLISHABLE_KEY: pk })).toEqual({ VITE_CLERK_PUBLISHABLE_KEY: pk })
      expect(read({ CLERK_PUBLISHABLE_KEY: '  ' })).toEqual({})
      expect(read({})).toEqual({})
      expect(warn).not.toHaveBeenCalled()
    })

    it('still fails a half-set pair under the documented name', () => {
      const raw = envAliases(vi.fn())({ CLERK_PUBLISHABLE_KEY: pk })
      expect(run(raw)).toThrow(
        /CLERK_SECRET_KEY is missing \(set both VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY/,
      )
    })
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
