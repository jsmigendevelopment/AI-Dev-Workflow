import { describe, expect, it } from 'vitest'
import { scrubEvent, sentryIngestOrigin, sentryOptions } from './monitoring'

describe('monitoring options', () => {
  it('reads the ingest origin for the CSP from the DSN, and nothing without one', () => {
    expect(sentryIngestOrigin('https://abc@o123.ingest.us.sentry.io/456')).toEqual(['https://o123.ingest.us.sentry.io'])
    expect(sentryIngestOrigin(undefined)).toEqual([])
    expect(sentryIngestOrigin('not a url')).toEqual([])
    expect(sentryIngestOrigin('http://abc@insecure.example/1')).toEqual([])
  })

  it('is off without a DSN', () => {
    expect(sentryOptions({ dsn: undefined })).toMatchObject({ dsn: undefined, enabled: false })
    expect(sentryOptions({ dsn: '' })).toMatchObject({ dsn: undefined, enabled: false })
  })

  it('is on with a DSN, errors only', () => {
    expect(sentryOptions({ dsn: 'https://key@o1.ingest.sentry.io/1', environment: 'test' })).toMatchObject({
      enabled: true,
      environment: 'test',
      tracesSampleRate: 0,
    })
  })

  it('scrubs cookies, auth and webhook signatures, bodies, query strings and IPs', () => {
    const event = scrubEvent({
      request: {
        cookies: { __session: 'x' },
        data: '{"card":"4242"}',
        query_string: 'token=abc',
        headers: { Cookie: 'a=b', Authorization: 'Bearer t', 'Stripe-Signature': 's', 'user-agent': 'ua' },
      },
      user: { id: 'user_1', ip_address: '203.0.113.9', email: 'a@example.com' },
    })
    expect(event).toEqual({ request: { headers: { 'user-agent': 'ua' } }, user: { id: 'user_1' } })
  })
})
