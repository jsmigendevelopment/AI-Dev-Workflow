import { afterEach, describe, expect, it, vi } from 'vitest'

import { logger } from './logger'

const lines = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)

afterEach(() => vi.restoreAllMocks())

describe('logger', () => {
  it('writes one JSON line with the standard fields', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('note_created', { request_id: 'r1', user_id: 'u1' })
    const [line, ...rest] = lines(spy)
    expect(rest).toEqual([])
    expect(line?.ts).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/)
    expect(line).toMatchObject({ level: 'info', event: 'note_created', request_id: 'r1', user_id: 'u1' })
  })

  it('masks secrets, tokens and emails, however deep', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('sign_in_failed', {
      email: 'ann@example.com',
      headers: { Authorization: 'Bearer abc', cookie: 'a=b' },
      attempts: [{ apiKey: 'k' }],
    })
    const [line] = lines(spy)
    expect(JSON.stringify(line)).not.toMatch(/ann@example|abc|a=b|"k"/)
    expect(line).toMatchObject({ email: '[redacted]', headers: { Authorization: '[redacted]' } })
  })

  it('keeps an error’s name, message and stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('request_failed', { error: new Error('boom') })
    const error = lines(spy)[0]?.error as Record<string, unknown>
    expect(error).toMatchObject({ name: 'Error', message: 'boom' })
    expect(error.stack).toContain('logger.test')
  })
})
