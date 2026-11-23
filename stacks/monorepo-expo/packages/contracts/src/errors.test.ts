import * as z from 'zod'
import { describe, expect, it } from 'vitest'
import { ERROR_STATUS, apiResult } from './errors'

describe('error envelope', () => {
  const envelope = apiResult(z.object({ id: z.string() }))

  it('parses a success and a failure', () => {
    expect(envelope.parse({ ok: true, data: { id: 'a' } })).toEqual({ ok: true, data: { id: 'a' } })
    const failure = {
      ok: false,
      error: { code: 'validation', message: 'Some fields need attention.', fields: { title: ['Too long'] } },
    }
    expect(envelope.parse(failure)).toEqual(failure)
  })

  it('refuses an unknown error code and a success without data', () => {
    expect(envelope.safeParse({ ok: false, error: { code: 'teapot', message: 'x' } }).success).toBe(false)
    expect(envelope.safeParse({ ok: true }).success).toBe(false)
  })

  it('maps every code to one HTTP status', () => {
    expect(ERROR_STATUS.unauthenticated).toBe(401)
    expect(ERROR_STATUS.not_found).toBe(404)
    expect(new Set(Object.values(ERROR_STATUS)).size).toBe(Object.keys(ERROR_STATUS).length)
  })
})
