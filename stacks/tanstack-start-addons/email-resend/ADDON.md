# email-resend

Transactional email through Resend: an `EmailSender` port, a Resend adapter over plain `fetch`, a memory fake for tests, and one escaped welcome template.

| | |
|---|---|
| **Choose it when** | the app must send email itself: a welcome, a receipt, a "someone replied" notice. (Sign-in emails are Clerk's job, not this add-on's.) |
| **Alternatives** | Postmark or Amazon SES behind the same port; Cloudflare Email Routing is for receiving, not sending |
| **Env vars** | `RESEND_API_KEY` (secret), `EMAIL_FROM` (a sender on a verified domain) |
| **Packages** | none (Resend's REST API over `fetch`) |
| **Issue** | `Skills: build, web-security` · lane `risky` (email to outside addresses can be abused to mail strangers, and it costs money past the free tier) |

## What it adds

- `src/lib/email/email.ts`: the `EmailMessage` type, the `EmailSender` port and `disabledEmailSender`, which fails every send as `unavailable`. Services depend on the port, so they never import an SDK or read env.
- `src/lib/email/email.memory.ts`: the test fake. An outbox, and the same idempotency rule as Resend (a repeated key returns the first id and sends nothing).
- `src/lib/email/html.ts`: an `html` tagged template that escapes every value, `cleanLine` (drops control and bidi characters) and `safeUrl` (http and https only).
- `src/lib/email/templates/welcome.ts`: the one template. HTML tables with inline styles, plus a plain-text part.
- `src/server/email.resend.ts`: the adapter. One `POST https://api.resend.com/emails` with `Idempotency-Key` and a `User-Agent` (Resend answers 403 without one). It retries only 429 and 5xx, up to 3 attempts, 500 ms then 1,500 ms or `Retry-After` capped at 5 s. It never retries another 4xx or a network error.
- Tests: `src/lib/email/email.test.ts` (fake, fail-closed, template escaping) and `src/server/email.resend.test.ts` (request shape, retries, give-up, no key in errors; `fetch` is faked).

Why no SDK and no React Email: on Workers the `resend` SDK adds about 169 KiB for this one POST, and React Email's `render()` adds about 320 KiB (it pulls `react-dom/server` and `html-to-text`). For one or two templates, an escaping template is lighter. With many templates, switch to React Email (`react-email` for components, `@react-email/render` to render, on the server only) behind the same port.

With no key, the app builds and tests pass, and every send fails closed.

## Apply

1. Copy `files/` into the project root. The CLI does this step: `npx ai-dev-workflow add tanstack-start/email-resend`.
2. `src/env.d.ts`: inside `interface Env`, add:
   ```ts
   RESEND_API_KEY?: string
   EMAIL_FROM?: string
   ```
3. `src/server/composition.ts`: add the imports and one factory.
   ```ts
   import { disabledEmailSender, type EmailSender } from '@/lib/email/email'
   import { resendEmailSender } from './email.resend'
   ```
   ```ts
   /** Resend when both are set; otherwise every send fails closed as `unavailable`. */
   export function emailSender(): EmailSender {
     const apiKey = env.RESEND_API_KEY
     const from = env.EMAIL_FROM
     return apiKey && from ? resendEmailSender({ apiKey, from }) : disabledEmailSender
   }
   ```
4. `.env.example`: add the names, with no values.
   ```sh
   # Resend (resend.com, free tier) for transactional email. Empty means every send fails as "unavailable".
   # EMAIL_FROM is a sender on a domain you verified in Resend, e.g. Acme <hello@mail.example.com>.
   RESEND_API_KEY=
   EMAIL_FROM=
   ```
5. Send from a service. Inject the port, and build the idempotency key from a stored id:
   ```ts
   // <feature>.service.ts
   import type { EmailSender } from '@/lib/email/email'
   import { welcomeEmail } from '@/lib/email/templates/welcome'

   export function createAccountService({ email }: { email: EmailSender /* , repo, now, ... */ }) {
     return {
       async welcome(actor: Actor, to: string, name: string) {
         const content = welcomeEmail({ appName: 'Acme', name, url: 'https://app.example.com/' })
         await email.send({ to, ...content, idempotencyKey: `welcome/${actor.userId}`, tags: { kind: 'welcome' } })
       },
     }
   }
   // composition.ts: createAccountService({ email: emailSender(), ... })
   // tests: const { sender, outbox } = memoryEmailSender()
   ```
   Send only to an address you got from the auth provider or verified yourself. Never auto-reply to an address typed into a public form: that mails strangers on your domain's reputation.
6. Keys stay with the person: they verify a sending domain in Resend (SPF and DKIM records), then set `pnpm exec wrangler secret put RESEND_API_KEY --env test` and `EMAIL_FROM` (and again with `--env production`). Use a separate key for test and production.
7. `pnpm exec eslint --fix . && pnpm format`: the pack's lint sorts imports, including the ones this add-on added.
8. `pnpm check`.

## Verify

- `pnpm test` runs 10 email tests: the fake's dedupe, fail-closed, escaping of a hostile name (`<img onerror>` and U+202E), `javascript:` links refused, the adapter's headers and body, retry on 429 and 5xx with one key, giving up after 3, no retry on 422.
- With a test key in `.dev.vars`, call the service from a route in `pnpm dev` and check the email in Resend's dashboard (Emails > Logs). Send it twice: one email, because of the idempotency key.

## Not verified here

Real delivery through Resend, domain verification and the 403 without `User-Agent` (no network to Resend). Delivery webhooks (bounces, complaints) aren't included. If you need them, verify the Svix signature with Web Crypto on the raw body, as the `web-security` skill describes.
