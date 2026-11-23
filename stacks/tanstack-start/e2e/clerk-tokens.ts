import { generateKeyPairSync } from 'node:crypto'

import { type APIRequestContext, expect } from '@playwright/test'
import { importPKCS8, SignJWT } from 'jose'

/**
 * A made-up Clerk development instance for the `clerk` preview (playwright.config.ts): keys that
 * only look real, and a fresh RSA key pair per run whose public half is `CLERK_JWT_KEY`, so Clerk
 * verifies the tokens these tests sign with no network. Generated once in the runner; workers
 * inherit it through the environment. Test values, not secrets.
 */
function keyPair(): { privatePem: string; publicPem: string } {
  if (!process.env.E2E_CLERK_PRIVATE_PEM || !process.env.E2E_CLERK_PUBLIC_PEM) {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.E2E_CLERK_PRIVATE_PEM = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    process.env.E2E_CLERK_PUBLIC_PEM = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  }
  return { privatePem: process.env.E2E_CLERK_PRIVATE_PEM, publicPem: process.env.E2E_CLERK_PUBLIC_PEM }
}

const FRONTEND_API = 'e2e-only.clerk.accounts.dev'

/**
 * The Worker vars of the `clerk` preview. `publishableKeyName` is Clerk's documented name by
 * default; the old `CLERK_PUBLISHABLE_KEY` proves the alias (#13) on a built Worker.
 */
export function e2eClerkVars(
  publishableKeyName: 'VITE_CLERK_PUBLISHABLE_KEY' | 'CLERK_PUBLISHABLE_KEY' = 'VITE_CLERK_PUBLISHABLE_KEY',
): Record<string, string> {
  return {
    [publishableKeyName]: `pk_test_${Buffer.from(`${FRONTEND_API}$`).toString('base64')}`,
    CLERK_SECRET_KEY: 'sk_test_e2e-only-not-a-secret',
    CLERK_JWT_KEY: keyPair().publicPem,
  }
}

// Clerk refuses a session token without its session category in the header (token-type-mismatch).
const SESSION_CATEGORY = 'cl_B7d4PD111AAA'

/** The `app` claim the Clerk previews expect from a native token (`CLERK_NATIVE_APP_CLAIM`). */
export const E2E_APP = 'e2e-app'

type Claims = Record<string, unknown>

/**
 * A session token as Clerk would mint it; `azp: undefined` leaves the claim out. `claims` are the
 * instance's custom session claims, such as `{ app: E2E_APP }`.
 */
export async function sessionToken(
  azp: string | undefined,
  claims: Claims = {},
): Promise<{ token: string; iat: number }> {
  const iat = Math.floor(Date.now() / 1000) - 5
  const key = await importPKCS8(keyPair().privatePem, 'RS256')
  const token = await new SignJWT({ ...claims, sid: 'sess_e2e', ...(azp === undefined ? {} : { azp }) })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'ins_e2e', cat: SESSION_CATEGORY })
    .setSubject('user_e2e')
    .setIssuer(`https://${FRONTEND_API}`)
    .setIssuedAt(iat)
    .setNotBefore(iat)
    .setExpirationTime(iat + 300)
    .sign(key)
  return { token, iat }
}

/**
 * What Clerk's Frontend API sends back at the end of a handshake (`__clerk_handshake`): a JWT
 * signed with the instance key whose `handshake` claim is the `Set-Cookie` directives.
 */
export async function handshakeToken(directives: string[]): Promise<string> {
  const key = await importPKCS8(keyPair().privatePem, 'RS256')
  return new SignJWT({ handshake: directives })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'ins_e2e' })
    .sign(key)
}

/** The `Cookie` header Clerk's browser SDK sets on a development instance, for `azp`. */
export async function sessionCookie(azp: string | undefined, claims: Claims = {}): Promise<string> {
  const { token, iat } = await sessionToken(azp, claims)
  return `__session=${token}; __client_uat=${iat}; __clerk_db_jwt=dvb_e2e`
}

/** An unsigned token with no `azp`: what an attacker puts in a header Clerk may not read. */
export const UNSIGNED = `${btoa('{"alg":"none"}')}.${btoa('{"sub":"user_e2e"}')}.x`.replace(/=/g, '')

/** `GET /api/v1/notes` with a session token for `azp` as the bearer. */
export const bearer = async (request: APIRequestContext, azp: string | undefined, claims: Claims = {}) => {
  const { token } = await sessionToken(azp, claims)
  return request.get('/api/v1/notes', { headers: { authorization: `Bearer ${token}` } })
}

// The session cookie as Clerk's browser SDK sets it on a development instance. The page's
// server-rendered Clerk state says who Clerk let in.
export const signedInAs = async (
  request: APIRequestContext,
  azp: string | undefined,
  claims: Claims = {},
) => {
  const cookie = await sessionCookie(azp, claims)
  const response = await request.get('/', { headers: { cookie } })
  expect(response.status()).toBe(200)
  for (const header of ['x-clerk-auth-reason', 'x-clerk-auth-message'])
    expect(response.headers()[header], header).toBeUndefined()
  const html = await response.text()
  // Clerk writes the refusal reason, and every allowed origin, into the page state by default.
  expect(html).not.toContain('token-invalid')
  expect(html).not.toContain('Expected')
  return /"userId":(null|"[^"]*")/.exec(html)?.[1]
}
