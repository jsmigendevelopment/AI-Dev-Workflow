/** Escapes text for HTML element content and quoted attribute values. */
export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** A trusted piece of markup, so `html` doesn't escape it twice. */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString() {
    return this.value
  }
}

/**
 * Tagged template for email markup: every `${value}` is escaped unless it is already SafeHtml.
 * So user text (a name, a title) can never inject markup into an email.
 */
export function html(strings: TemplateStringsArray, ...values: (string | number | SafeHtml)[]): SafeHtml {
  let out = strings[0] ?? ''
  values.forEach((value, i) => {
    out += value instanceof SafeHtml ? value.value : escapeHtml(String(value))
    out += strings[i + 1] ?? ''
  })
  return new SafeHtml(out)
}

/** Drops control and format characters (bidi overrides, zero-width) and collapses whitespace. */
export const cleanLine = (value: string): string =>
  value
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Only http(s) links go into an email. */
export function safeUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http(s) links in emails.')
  return url.toString()
}
