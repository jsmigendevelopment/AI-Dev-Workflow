import { cleanLine, html, safeUrl } from '../html'

export interface WelcomeEmailInput {
  appName: string
  /** The person's display name. Untrusted: it is cleaned and escaped. */
  name: string
  /** Where the button goes, e.g. the app's home page. */
  url: string
}

/**
 * The one transactional template: a welcome email. Plain HTML tables and inline styles, which is
 * what email clients render reliably, plus a plain-text part.
 */
export function welcomeEmail(input: WelcomeEmailInput): { subject: string; html: string; text: string } {
  const appName = cleanLine(input.appName)
  const name = cleanLine(input.name).slice(0, 80) || 'there'
  const url = safeUrl(input.url)
  const subject = `Welcome to ${appName}`
  const body = html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${subject}</title>
      </head>
      <body
        style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b"
      >
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
          <tr>
            <td align="center">
              <table
                role="presentation"
                width="560"
                cellpadding="0"
                cellspacing="0"
                style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:32px"
              >
                <tr>
                  <td><h1 style="margin:0 0 16px;font-size:22px">Welcome, ${name}</h1></td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0 0 24px;font-size:16px;line-height:24px">
                      Your ${appName} account is ready.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <a
                      href="${url}"
                      style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:16px"
                      >Open ${appName}</a
                    >
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:24px 0 0;font-size:13px;color:#52525b">
                      You got this email because you signed up for ${appName}.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`
  const text = `Welcome, ${name}\n\nYour ${appName} account is ready.\n\nOpen ${appName}: ${url}\n\nYou got this email because you signed up for ${appName}.\n`
  return { subject, html: body.value, text }
}
