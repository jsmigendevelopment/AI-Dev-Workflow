import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const root = new URL('..', import.meta.url)
const scripts = (
  JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { scripts: Record<string, string> }
).scripts

describe('the local gate', () => {
  it('WHEN the repo is checked THEN it holds no .github/workflows/ file, and pnpm check runs lint, typecheck, test and build in that order', () => {
    expect(existsSync(new URL('.github/workflows', root))).toBe(false)
    expect(scripts['check']).toBe('pnpm lint && pnpm typecheck && pnpm test && pnpm build')
  })

  it('pnpm gate runs check first, then e2e and the secret scan', () => {
    expect(scripts['gate']).toBe('pnpm check && pnpm test:e2e && pnpm scan:secrets')
  })

  it('every command in the check contract exists', () => {
    for (const name of ['check', 'lint', 'typecheck', 'test', 'test:e2e', 'build']) {
      expect(scripts[name], name).toBeDefined()
    }
  })
})
