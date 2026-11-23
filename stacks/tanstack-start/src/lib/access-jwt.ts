import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

import { problemResponse } from './app-error'
import { isOpenPath, OPEN_PATHS } from './open-paths'

/**
 * Defence in depth behind Cloudflare Access. Access answers at the edge, before the Worker; this
 * checks, in the Worker, that a request on an Access-protected path really came through Access:
 * the `Cf-Access-Jwt-Assertion` header is a JWT signed by the team's key, for this app's audience
 * (AUD), not expired. Anything else gets the uniform 401 envelope. On only where `SITE_PROTECTION`
 * is "access"; setup-cloudflare writes the team domain and AUD per environment.
 *
 * Not `ctx.access`: Cloudflare's docs say a Worker with static assets (Start, through the Vite
 * plugin) runs behind a router that does not pass it on. Static files are covered by Access only.
 */

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion'

export interface AccessConfig {
  /** `https://<team>.cloudflareaccess.com`: the token's issuer, and where its keys live. */
  teamDomain: string
  /** The Access application's audience tag. */
  aud: string
  /** Paths that need the token: exact, or a prefix ending in `/*`. `/*` is every path. */
  paths: readonly string[]
}

/** `ACCESS_PATHS` ("/admin/*,/ops/*") as a list; unset means every path. */
export const accessPaths = (value: string | undefined): string[] =>
  value
    ? value
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : ['/*']

const keySets = new Map<string, JWTVerifyGetKey>()

/** The team's signing keys, fetched and cached per isolate; jose refetches on an unknown `kid`. */
export function teamKeys(teamDomain: string): JWTVerifyGetKey {
  let keys = keySets.get(teamDomain)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
    keySets.set(teamDomain, keys)
  }
  return keys
}

/** Why a token was refused, for the log: never the token itself. */
export type AccessRefusal = 'missing' | 'invalid'

const refuse = () =>
  problemResponse('unauthenticated', 'Sign in through Cloudflare Access to continue.', {
    'WWW-Authenticate': 'Cloudflare-Access realm="site"',
  })

/**
 * Null when the request may go on; otherwise the 401. Fails closed: no header, a bad signature,
 * the wrong audience or issuer, an expired token or a key fetch that fails are all refused.
 */
export async function accessCheck(
  request: Request,
  url: URL,
  config: AccessConfig,
  keys: JWTVerifyGetKey = teamKeys(config.teamDomain),
  onRefuse: (why: AccessRefusal) => void = () => {},
  open: readonly string[] = OPEN_PATHS,
): Promise<Response | null> {
  if (!isOpenPath(url.pathname, config.paths) || isOpenPath(url.pathname, open)) return null
  const token = request.headers.get(ACCESS_JWT_HEADER)
  if (!token) return (onRefuse('missing'), refuse())
  try {
    await jwtVerify(token, keys, {
      issuer: config.teamDomain,
      audience: config.aud,
      algorithms: ['RS256'],
      requiredClaims: ['exp'],
    })
    return null
  } catch {
    // Every failure answers the same way: the reason stays out of the response.
    onRefuse('invalid')
    return refuse()
  }
}
