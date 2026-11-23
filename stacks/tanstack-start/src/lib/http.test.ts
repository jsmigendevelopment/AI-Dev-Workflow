import { describe, expect, it } from 'vitest'

import { bearerToken, envelopeResponse, methodNotAllowed, queryObject, readJson } from './http'

const withAuth = (value?: string) =>
  new Request('https://app.example.com/api/v1/notes', { headers: value ? { authorization: value } : {} })

describe('api helpers', () => {
  it('reads a bearer token from the Authorization header only', () => {
    expect(bearerToken(withAuth('Bearer eyJ.abc-_.x9'))).toBe('eyJ.abc-_.x9')
    expect(bearerToken(withAuth('bearer   tok'))).toBe('tok')
    expect(bearerToken(withAuth())).toBeNull()
    expect(bearerToken(withAuth('Basic dXNlcjpwYXNz'))).toBeNull()
    expect(bearerToken(withAuth('Bearer two tokens'))).toBeNull()
    const cookieOnly = new Request('https://app.example.com/', { headers: { cookie: '__session=eyJ.a.b' } })
    expect(bearerToken(cookieOnly)).toBeNull()
  })

  it('maps the envelope to a status, with a Bearer challenge on 401', async () => {
    expect(envelopeResponse({ ok: true, data: 1 }, 201).status).toBe(201)
    const denied = envelopeResponse({ ok: false, error: { code: 'unauthenticated', message: 'Sign in.' } })
    expect(denied.status).toBe(401)
    expect(denied.headers.get('www-authenticate')).toBe('Bearer')
    const missing = envelopeResponse({ ok: false, error: { code: 'not_found', message: 'Gone.' } })
    expect(missing.status).toBe(404)
    expect(missing.headers.get('www-authenticate')).toBeNull()
    expect(missing.headers.get('content-type')).toBe('application/json')
  })

  it('reads JSON bodies and refuses anything else', async () => {
    const post = (type: string, body: string) =>
      new Request('https://app.example.com/', { method: 'POST', headers: { 'content-type': type }, body })
    expect(await readJson(post('application/json; charset=utf-8', '{"a":1}'))).toEqual({
      ok: true,
      data: { a: 1 },
    })
    expect(await readJson(post('application/json', '{'))).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    })
    expect(await readJson(post('text/plain', '{}'))).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    })
  })

  it('turns the query string into an object', () => {
    expect(queryObject(new URL('https://a.example/?limit=5&cursor=x&limit=6'))).toEqual({
      limit: '6',
      cursor: 'x',
    })
  })

  it('answers other methods with 405 and Allow', async () => {
    const response = methodNotAllowed('GET', 'POST')()
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, POST')
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'validation', message: 'Use GET or POST.' },
    })
  })
})
