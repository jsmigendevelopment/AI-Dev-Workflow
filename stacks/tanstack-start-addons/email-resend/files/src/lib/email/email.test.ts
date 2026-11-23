import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/app-error'
import { disabledEmailSender, type EmailMessage } from './email'
import { memoryEmailSender } from './email.memory'
import { html } from './html'
import { welcomeEmail } from './templates/welcome'

const message = (over: Partial<EmailMessage> = {}): EmailMessage => ({
  to: 'ann@example.com',
  subject: 'Hi',
  html: '<p>Hi</p>',
  text: 'Hi',
  idempotencyKey: 'welcome/user_ann',
  ...over,
})

describe('email port', () => {
  it('the memory fake records a send and dedupes on the idempotency key', async () => {
    const { sender, outbox } = memoryEmailSender()
    const first = await sender.send(message())
    const again = await sender.send(message({ subject: 'Hi again' }))
    await sender.send(message({ idempotencyKey: 'welcome/user_bob', to: 'bob@example.com' }))
    expect(again).toEqual(first)
    expect(outbox.map((m) => m.to)).toEqual(['ann@example.com', 'bob@example.com'])
  })

  it('fails closed when email is not set up', async () => {
    await expect(disabledEmailSender.send(message())).rejects.toMatchObject({ code: 'unavailable' })
    await expect(disabledEmailSender.send(message())).rejects.toBeInstanceOf(AppError)
  })
})

describe('welcome template', () => {
  const input = { appName: 'Acme', name: 'Ann', url: 'https://app.example.com/' }

  it('renders the subject, an HTML part with the link, and a text part', () => {
    const email = welcomeEmail(input)
    expect(email.subject).toBe('Welcome to Acme')
    expect(email.html).toContain('<html lang="en">')
    expect(email.html).toContain('href="https://app.example.com/"')
    expect(email.html).toContain('Welcome, Ann')
    expect(email.text).toContain('Open Acme: https://app.example.com/')
  })

  it('escapes and cleans a hostile name', () => {
    const email = welcomeEmail({ ...input, name: '<img src=x onerror=alert(1)>‮evil\n' })
    expect(email.html).not.toContain('<img')
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt; evil')
    expect(email.text).not.toContain('‮')
  })

  it('refuses a javascript: link', () => {
    expect(() => welcomeEmail({ ...input, url: 'javascript:alert(1)' })).toThrow()
  })

  it('html`` escapes values but not nested SafeHtml', () => {
    expect(html`<b>${'<i>'}</b>${html`<i>ok</i>`}`.value).toBe('<b>&lt;i&gt;</b><i>ok</i>')
  })
})
