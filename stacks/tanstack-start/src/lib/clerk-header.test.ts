import { generateKeyPairSync } from 'node:crypto'

import { createClerkClient } from '@clerk/backend'
import { importPKCS8, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

import { parseBearer } from './http'

// `parseBearer` against Clerk's own parsing on the same `Authorization` values. Clerk's parser
// isn't exported, so its answer is read from `authenticateRequest` with no cookie: it signs in
// only when it found this token in the header. Whenever ours returns a token, Clerk must have
// read the same one; ours may refuse more, never less.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwtKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const publishableKey = `pk_test_${btoa('unit-only.clerk.accounts.dev$')}`
const clerk = createClerkClient({ secretKey: 'sk_test_unit-only', publishableKey, jwtKey })

async function sessionToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'RS256')
  return new SignJWT({ sid: 'sess_unit', azp: 'https://app.example.com' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'ins_unit', cat: 'cl_B7d4PD111AAA' })
    .setSubject('user_unit')
    .setIssuedAt(now - 5)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 60)
    .sign(key)
}

async function clerkSignsIn(headers: Headers): Promise<boolean> {
  const request = new Request('https://app.example.com/api/v1/notes', { headers })
  const state = await clerk.authenticateRequest(request, {
    jwtKey,
    authorizedParties: ['https://app.example.com'],
  })
  return state.isAuthenticated
}

describe('parseBearer reads the Authorization header exactly as Clerk does', () => {
  it('agrees with Clerk on every shape of the header', async () => {
    const token = await sessionToken()
    const values = [
      `Bearer ${token}`,
      `bearer ${token}`,
      `BEARER ${token}`,
      `Bearer  ${token}`,
      `Bearer\t${token}`,
      'Bearer',
      'Bearer ',
      token,
      `Bearer ${token} extra`,
      `Basic ${token}`,
      `Bearer ${token}, Bearer ${token}`,
    ]
    for (const value of values) {
      const headers = new Headers({ authorization: value })
      const ours = parseBearer(headers.get('authorization'))
      if (ours !== null) expect(ours, value).toBe(token)
      if (ours !== null) expect(await clerkSignsIn(headers), value).toBe(true)
    }
    expect(parseBearer(`Bearer ${token}`)).toBe(token)
  })

  it('two Authorization values never read as one token', async () => {
    const token = await sessionToken()
    const headers = new Headers()
    headers.append('authorization', `Bearer ${token}`)
    headers.append('authorization', `Bearer ${token}`)
    expect(parseBearer(headers.get('authorization'))).toBeNull()
  })

  it('refuses every scheme Clerk ignores (where Clerk falls back to the cookie)', () => {
    for (const value of ['bearer abc', 'BEARER abc', 'Bearer  abc', 'Bearer\tabc', 'Bearer', 'Bearer ', ''])
      expect(parseBearer(value), JSON.stringify(value)).toBeNull()
  })
})
