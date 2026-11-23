/**
 * Cloudflare Web Analytics: one deferred script, no cookies, no inline JavaScript (so it works
 * under a strict Content-Security-Policy that allows the beacon host). Renders nothing without a
 * token, so a build with no token ships no analytics at all.
 */
export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

/** Site tokens are 32 hex characters. Anything else is a typo, and we'd rather send nothing. */
const TOKEN = /^[a-f0-9]{32}$/

export function WebAnalytics({ token }: { token: string | undefined }) {
  if (!token || !TOKEN.test(token)) return null
  return <script defer src={BEACON_SRC} data-cf-beacon={JSON.stringify({ token, spa: true })} />
}
