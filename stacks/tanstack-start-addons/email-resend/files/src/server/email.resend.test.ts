import { describe, expect, it, vi } from 'vitest'
import type { EmailMessage } from '@/lib/email/email'
import { resendEmailSender } from './email.resend'

const message: EmailMessage = {
  to: 'ann@example.com',
  subject: 'Welcome',
  html: '<p>Hi</p>',
  text: 'Hi',
  idempotencyKey: 'welcome/user_ann',
  tags: { kind: 'welcome' },
}

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

function setup(...responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const r of responses) fetch.mockResolvedValueOnce(r)
  const sleep = vi.fn((_ms: number) => Promise.resolve())
  const sender = resendEmailSender({ apiKey: 're_test_123', from: 'Acme <hello@example.com>', fetch, sleep })
  return { sender, fetch, sleep }
}

describe('resend adapter (no network: fetch is faked)', () => {
  it('posts the message with auth, idempotency key and a user agent', async () => {
    const { sender, fetch } = setup(reply(200, { id: 'em_1' }))
    expect(await sender.send(message)).toEqual({ id: 'em_1' })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer re_test_123',
      'Idempotency-Key': 'welcome/user_ann',
      'User-Agent': expect.any(String),
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Acme <hello@example.com>',
      to: ['ann@example.com'],
      subject: 'Welcome',
      html: '<p>Hi</p>',
      text: 'Hi',
      tags: [{ name: 'kind', value: 'welcome' }],
    })
  })

  it('retries 429 and 5xx with the same key, honouring a capped Retry-After', async () => {
    const { sender, fetch, sleep } = setup(
      reply(429, {}, { 'retry-after': '60' }),
      reply(503),
      reply(200, { id: 'em_2' }),
    )
    expect(await sender.send(message)).toEqual({ id: 'em_2' })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5000, 1500])
    const keys = fetch.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key'],
    )
    expect(new Set(keys)).toEqual(new Set(['welcome/user_ann']))
  })

  it('gives up after three attempts', async () => {
    const { sender, fetch } = setup(reply(500), reply(500), reply(500))
    await expect(sender.send(message)).rejects.toThrow('Resend send failed: 500')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('never retries a 4xx other than 429, and never puts the key in the error', async () => {
    const { sender, fetch } = setup(reply(422, { name: 'validation_error' }))
    const error = await sender.send(message).catch((e: Error) => e)
    expect(String(error)).toContain('422')
    expect(String(error)).not.toContain('re_test_123')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
