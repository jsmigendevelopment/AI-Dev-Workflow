const MASK = '[masked]'

// Token shapes: provider keys (sk-…), JWTs, bearer values, cookie headers and emails. Over-masking a
// harmless line is fine; a leaked token is not.
const PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(Set-)?Cookie:\s*[^\n]*/gi,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
]

// Fields whose whole value is a secret, whatever it looks like.
const SECRET_KEY = /token|cookie|secret|password|authorization|api[-_]?key|credential/i

/** The text with every token-shaped string, cookie and email replaced by `[masked]`. */
export function maskText(text: string): string {
  return PATTERNS.reduce((out, pattern) => out.replace(pattern, MASK), text)
}

/** A JSON.stringify replacer that masks secret fields and every string value. */
export function maskReplacer(key: string, value: unknown): unknown {
  if (key !== '' && SECRET_KEY.test(key)) return MASK
  return typeof value === 'string' ? maskText(value) : value
}
