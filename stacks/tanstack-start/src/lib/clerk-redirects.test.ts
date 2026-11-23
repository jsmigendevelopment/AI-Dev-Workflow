import { createClerkClient } from '@clerk/backend'
import { describe, expect, it } from 'vitest'

import {
  clerkFrontendOrigins,
  foreignRedirectParam,
  leavesAllowedOrigins,
  refusedRedirect,
} from './clerk-redirects'

const APP = 'https://app.example.com'
const SATELLITE = 'https://satellite.example.com'
const PARTIES = [APP, SATELLITE]
const FAPI = 'unit-only.clerk.accounts.dev'

const param = (query: string) => foreignRedirectParam(new URL(`${APP}/notes?${query}`), PARTIES)
const enc = encodeURIComponent

const FOREIGN = [
  'https://evil.example/x',
  'http://app.example.com/x',
  'https://app.example.com:8443/x',
  'https://app.example.com.evil.example/x',
  'https://app.example.com@evil.example/x',
  'https://evil.example\\@app.example.com/x',
  '//evil.example/x',
  '/relative',
  'javascript:alert(1)',
  'data:text/html,x',
  'not a url',
  '',
]

describe('foreignRedirectParam: a Clerk redirect target must be an authorized party (#66)', () => {
  it('allows an absolute URL on an authorized party, any path and query', () => {
    expect(param(`__clerk_redirect_url=${enc(`${SATELLITE}/back?x=1`)}`)).toBeNull()
    expect(param(`__clerk_satellite_url=${enc(`${APP}/`)}`)).toBeNull()
    expect(param(`__clerk_redirect_url=${enc(`${APP}/a`)}&__clerk_redirect_url=${enc(SATELLITE)}`)).toBeNull()
  })

  it('refuses every other value of __clerk_redirect_url and __clerk_satellite_url', () => {
    for (const value of FOREIGN) {
      expect(param(`__clerk_redirect_url=${enc(value)}`), value).toBe('__clerk_redirect_url')
      expect(param(`__clerk_satellite_url=${enc(value)}`), value).toBe('__clerk_satellite_url')
    }
  })

  it('checks every repeat and every spelling of the name', () => {
    const evil = enc('https://evil.example/')
    expect(param(`__clerk_redirect_url=${enc(APP)}&__clerk_redirect_url=${evil}`)).toBe(
      '__clerk_redirect_url',
    )
    expect(param(`%5F%5Fclerk_redirect_url=${evil}`)).toBe('__clerk_redirect_url')
    expect(param(`__CLERK_Redirect_URL=${evil}`)).toBe('__CLERK_Redirect_URL')
  })

  it('ignores other parameters, Clerk’s own included', () => {
    expect(param('redirect=https%3A%2F%2Fevil.example&__clerk_synced=true&__clerk_db_jwt=dvb_x')).toBeNull()
  })

  it('refuses everything when no origin is allowed', () => {
    const url = new URL(`${APP}/?__clerk_redirect_url=${enc(APP)}`)
    expect(foreignRedirectParam(url, ['urn:invalid:no-authorized-party'])).toBe('__clerk_redirect_url')
  })
})

const redirect = (location: string | null, status = 307) =>
  new Response(null, { status, headers: location === null ? {} : { location } })

describe('leavesAllowedOrigins: a Clerk redirect stays on the parties or its Frontend API', () => {
  const allowed = { parties: PARTIES, frontendApi: clerkFrontendOrigins(`pk_test_${btoa(`${FAPI}$`)}`) }
  const handshake = (back: string) =>
    `https://${FAPI}/v1/client/handshake?redirect_url=${enc(back)}&__clerk_db_jwt=d`
  const base = new URL(`${APP}/notes`)

  it('reads the Frontend API origin from the publishable key', () => {
    expect(clerkFrontendOrigins(`pk_test_${btoa(`${FAPI}$`)}`)).toEqual([`https://${FAPI}`])
    expect(clerkFrontendOrigins(undefined)).toEqual([])
  })

  it('keeps a redirect to the app, a satellite, Clerk’s handshake, or a relative path', () => {
    for (const location of [
      `${APP}/x`,
      `${SATELLITE}/x?__clerk_db_jwt=d`,
      `https://${FAPI}/v1/client/handshake`,
      handshake(`${APP}/notes?q=1`),
      handshake(SATELLITE),
      '/x',
    ])
      expect(leavesAllowedOrigins(redirect(location), base, allowed), location).toBe(false)
  })

  it('flags a redirect anywhere else, or one it cannot parse', () => {
    for (const location of [
      'https://evil.example/x',
      'http://app.example.com/',
      '//evil.example/',
      'https://accounts.dev/',
      'http://[x',
    ])
      expect(leavesAllowedOrigins(redirect(location), base, allowed), location).toBe(true)
  })

  it('flags a handshake whose redirect_url would bounce off the parties', () => {
    const back = ['http://evil.example/notes', 'http://app.example.com/', 'not-a-url', '/notes', '']
    for (const target of back)
      expect(leavesAllowedOrigins(redirect(handshake(target)), base, allowed), target).toBe(true)
    const twice = `${handshake(`${APP}/`)}&redirect_url=${enc('https://evil.example/')}`
    expect(leavesAllowedOrigins(redirect(twice), base, allowed)).toBe(true)
  })

  it('ignores responses that are not redirects', () => {
    expect(leavesAllowedOrigins(redirect('https://evil.example/', 200), base, allowed)).toBe(false)
    expect(leavesAllowedOrigins(redirect(null), base, allowed)).toBe(false)
  })
})

describe('refusedRedirect', () => {
  it('is a 400: plain text for a page, the envelope for a server function', async () => {
    const page = refusedRedirect(false)
    expect(page.status).toBe(400)
    expect(page.headers.get('content-type')).toContain('text/plain')
    const call = refusedRedirect(true)
    expect(call.status).toBe(400)
    expect(await call.json()).toMatchObject({ ok: false, error: { code: 'validation' } })
  })
})

// The threat, read from the installed @clerk/backend: on a development instance, a page request
// with `__clerk_redirect_url` is a 307 to that URL carrying the dev browser token. Whenever Clerk
// would redirect off the parties, the guard refuses the request first.
describe('against @clerk/backend: primary-responds-to-syncing', () => {
  const clerk = createClerkClient({
    secretKey: 'sk_test_unit-only',
    publishableKey: `pk_test_${btoa(`${FAPI}$`)}`,
  })

  async function clerkLocation(target: string): Promise<string | null> {
    const request = new Request(`${APP}/notes?__clerk_redirect_url=${enc(target)}`, {
      headers: { cookie: '__clerk_db_jwt=dvb_unit', 'sec-fetch-dest': 'document' },
    })
    const state = await clerk.authenticateRequest(request, { authorizedParties: PARTIES })
    return state.headers.get('location')
  }

  it('Clerk sends the token to any target; the guard refuses exactly the foreign ones', async () => {
    for (const target of ['https://evil.example/x', `${SATELLITE}/back`]) {
      const location = await clerkLocation(target)
      expect(location, target).toContain('__clerk_db_jwt=dvb_unit')
      const foreign = !PARTIES.includes(new URL(location!).origin)
      expect(param(`__clerk_redirect_url=${enc(target)}`) !== null, target).toBe(foreign)
    }
    expect(param(`__clerk_redirect_url=${enc('https://evil.example/x')}`)).not.toBeNull()
  })
})
