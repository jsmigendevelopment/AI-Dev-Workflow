/**
 * Small server-made HTML pages that ship no app code: the "Coming soon" page and the password
 * page. No script at all, one inline stylesheet, system fonts, light and dark from the OS setting.
 * The request guards add the security headers and the nonce CSP like on any other page.
 */

const ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
}
export const escapeHtml = (s: string) => s.replace(/[<>&"']/g, (c) => ESCAPES[c]!)

const STYLE = `
:root { color-scheme: light dark; --bg: #ffffff; --fg: #171717; --muted: #525252; --line: #d4d4d4; --accent: #171717; --accent-fg: #ffffff; --error: #b91c1c; }
@media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --fg: #fafafa; --muted: #a3a3a3; --line: #525252; --accent: #fafafa; --accent-fg: #0a0a0a; --error: #fca5a5; } }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--fg); }
body { font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; display: grid; place-items: center; min-height: 100vh; padding: 1.5rem; }
main { max-width: 28rem; width: 100%; }
h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 0.75rem; }
p { margin: 0 0 1rem; color: var(--muted); }
label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
input { width: 100%; min-height: 2.75rem; padding: 0.5rem 0.75rem; font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 0.375rem; }
input[aria-invalid="true"] { border-color: var(--error); }
button { margin-top: 0.75rem; min-height: 2.75rem; padding: 0.5rem 1.25rem; font: inherit; font-weight: 600; color: var(--accent-fg); background: var(--accent); border: 0; border-radius: 0.375rem; cursor: pointer; }
:focus-visible { outline: 3px solid var(--fg); outline-offset: 2px; }
.error { color: var(--error); margin: 0.5rem 0 0; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`

/** A whole page: `bodyHtml` must already be escaped. Always noindex, never cached by anyone. */
export function plainPage(
  title: string,
  bodyHtml: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<main>
${bodyHtml}
</main>
</body>
</html>
`
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      ...headers,
    },
  })
}
