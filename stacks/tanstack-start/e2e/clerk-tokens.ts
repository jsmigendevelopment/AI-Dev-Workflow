import { generateKeyPairSync } from 'node:crypto'

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

/** The Worker vars of the `clerk` preview. */
export function e2eClerkVars(): Record<string, string> {
  return {
    CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from(`${FRONTEND_API}$`).toString('base64')}`,
    CLERK_SECRET_KEY: 'sk_test_e2e-only-not-a-secret',
    CLERK_JWT_KEY: keyPair().publicPem,
  }
}

// Clerk refuses a session token without its session category in the header (token-type-mismatch).
const SESSION_CATEGORY = 'cl_B7d4PD111AAA'

/** A session token as Clerk would mint it; `azp: undefined` leaves the claim out. */
export async function sessionToken(azp: string | undefined): Promise<{ token: string; iat: number }> {
  const iat = Math.floor(Date.now() / 1000) - 5
  const key = await importPKCS8(keyPair().privatePem, 'RS256')
  const token = await new SignJWT({ sid: 'sess_e2e', ...(azp === undefined ? {} : { azp }) })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'ins_e2e', cat: SESSION_CATEGORY })
    .setSubject('user_e2e')
    .setIssuer(`https://${FRONTEND_API}`)
    .setIssuedAt(iat)
    .setNotBefore(iat)
    .setExpirationTime(iat + 300)
    .sign(key)
  return { token, iat }
}
