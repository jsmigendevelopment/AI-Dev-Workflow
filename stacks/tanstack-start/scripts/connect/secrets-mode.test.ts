// GitHub Free, private repo: no environments, so values go to repository secrets named
// TEST_<name> and PRODUCTION_<name>, switched by the repository variable SECRETS_MODE.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { typed, world } from './fakes'
import { groupsFor, type Run, storedName } from './places'
import type { VarSpec } from './providers'
import { neededNames } from './run'
import { readSecretsMode, repositoryPrefix } from './secrets-mode'
import { storeCommand } from './store'

const SECRET = 'sk_test_REPOMODE_5d2e'
const PROD_SECRET = 'sk_live_REPOMODE_8c1f'
const spec: VarSpec = { secret: true, scope: ['test', 'preview', 'production'], to: ['github'] }
const labels = (mode: 'environment' | 'repository') =>
  groupsFor(spec, mode).map((g) => [g.name, g.places.map((p) => p.label)])

describe('the GitHub name for each mode', () => {
  it('uses one environment per scope in environment mode, unprefixed', () => {
    expect(labels('environment')).toEqual([
      ['test', ['GitHub test (secret)', 'GitHub preview (secret)']],
      ['production', ['GitHub production (secret)']],
    ])
    const [place] = groupsFor(spec, 'environment')[0]!.places
    expect(storedName(place!, 'CLOUDFLARE_API_TOKEN')).toBe('CLOUDFLARE_API_TOKEN')
  })

  it('uses TEST_ for test and previews together, and PRODUCTION_ for production', () => {
    expect(repositoryPrefix('test')).toBe('TEST_')
    expect(repositoryPrefix('preview')).toBe('TEST_')
    expect(repositoryPrefix('production')).toBe('PRODUCTION_')
    expect(labels('repository')).toEqual([
      ['test', ['GitHub repository TEST_* (secret)']],
      ['production', ['GitHub repository PRODUCTION_* (secret)']],
    ])
    const [test, production] = groupsFor(spec, 'repository').map((g) => g.places[0]!)
    expect(storeCommand(test as never, 'CLOUDFLARE_API_TOKEN', 'acme/app')).toEqual([
      'gh',
      ['secret', 'set', 'TEST_CLOUDFLARE_API_TOKEN', '-R', 'acme/app'],
    ])
    expect(storeCommand(production as never, 'SITE_URL', 'acme/app')[1]).toEqual([
      'secret',
      'set',
      'PRODUCTION_SITE_URL',
      '-R',
      'acme/app',
    ])
  })

  it('reads the mode from the repository variable, and keeps environments otherwise', () => {
    const answer =
      (status: number, stdout: string): Run =>
      () => ({ status, stdout, stderr: '' })
    expect(readSecretsMode(answer(0, 'repository\n'), 'acme/app', 'actions')).toBe('repository')
    expect(readSecretsMode(answer(0, 'environment\n'), 'acme/app', 'actions')).toBe('environment')
    expect(readSecretsMode(answer(1, ''), 'acme/app', 'actions')).toBe('environment')
    const calls: string[][] = []
    const spy: Run = (cmd, args) => (
      calls.push([cmd, ...args]),
      { status: 0, stdout: 'repository', stderr: '' }
    )
    expect(readSecretsMode(spy, null, 'actions')).toBe('environment')
    expect(readSecretsMode(spy, 'acme/app', 'actions')).toBe('repository')
    expect(calls).toEqual([['gh', 'variable', 'get', 'SECRETS_MODE', '-R', 'acme/app']])
  })
})

describe('pnpm connect in repository mode', () => {
  let w: ReturnType<typeof world>
  beforeEach(() => (w = world()))
  afterEach(() => w.cleanup())
  const repoMode = { FAKE_SECRETS_MODE: 'repository' }

  it('writes TEST_ and PRODUCTION_ repository secrets, never an environment', async () => {
    // Open the page?, test value, three saves, production yes, production value, two saves, public.
    const { code, text } = await w.run(
      [],
      typed('n', SECRET, 'n', 'n', 'y', 'y', PROD_SECRET, 'n', 'y', ''),
      repoMode,
    )
    expect(code).toBe(0)
    expect(text).toContain('SECRETS_MODE is "repository"')
    expect(text).toContain(
      'Set DEMO_SECRET_KEY as GitHub secret TEST_DEMO_SECRET_KEY at repository level of acme/app?',
    )
    expect(w.writes().map((c) => [c.cmd, c.argv.join(' '), c.stdin])).toEqual([
      ['gh', 'secret set TEST_DEMO_SECRET_KEY -R acme/app', SECRET],
      ['gh', 'secret set PRODUCTION_DEMO_SECRET_KEY -R acme/app', PROD_SECRET],
    ])
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain(PROD_SECRET)
  })

  it('checks the prefixed names on a rerun', async () => {
    await w.run([], typed('n', SECRET, 'n', 'n', 'y', 'n', ''), repoMode)
    const { text } = await w.run(['--dry-run'], [], repoMode)
    expect(text).toContain('GitHub repository TEST_* (secret) ✓')
    expect(text).toContain('GitHub repository PRODUCTION_* (secret) ✗')
  })

  it('asks for X once when the workflows read TEST_X or X, and never for SECRETS_MODE', () => {
    const workflows = join(w.dir, '.github', 'workflows')
    mkdirSync(workflows, { recursive: true })
    writeFileSync(
      join(workflows, 'deploy.yml'),
      "token: ${{ vars.SECRETS_MODE == 'repository' && secrets.TEST_CF_TOKEN || secrets.CF_TOKEN }}\n" +
        'own: ${{ secrets.TEST_ONLY }}\n',
    )
    const names = neededNames({ app: w.dir, root: w.dir })
    expect(names.has('CF_TOKEN')).toBe(true)
    expect(names.has('TEST_CF_TOKEN')).toBe(false)
    expect(names.has('SECRETS_MODE')).toBe(false)
    expect(names.has('TEST_ONLY')).toBe(true)
  })
})

describe('pnpm connect on ci = "local" (#139)', () => {
  let w: ReturnType<typeof world>
  beforeEach(() => (w = world({ ci: 'local' })))
  afterEach(() => w.cleanup())

  it('has no GitHub places, and never asks GitHub for SECRETS_MODE', () => {
    expect(groupsFor(spec, 'none')).toEqual([])
    const calls: string[][] = []
    const spy: Run = (cmd, args) => (
      calls.push([cmd, ...args]),
      { status: 0, stdout: 'repository', stderr: '' }
    )
    expect(readSecretsMode(spy, 'acme/app', 'local')).toBe('none')
    expect(calls).toEqual([])
  })

  it('writes the local file and Cloudflare only, never GitHub, and prints no value', async () => {
    const dry = await w.run(['--dry-run'])
    expect(dry.text).toContain('ci = "local" (docs/stack.md): nothing goes to GitHub.')
    expect(dry.text).toMatch(/DEMO_SECRET_KEY: \.env\.local ✗, Cloudflare test ✗, Cloudflare production ✗\n/)
    // Open the page?, test value, two saves, production yes, production value, one save, public.
    const { code, text } = await w.run([], typed('n', SECRET, 'y', 'y', 'y', PROD_SECRET, 'y', ''))
    expect(code).toBe(0)
    expect(w.calls().filter((c) => c.cmd === 'gh')).toEqual([])
    expect(w.writes().map((c) => [c.cmd, c.argv.join(' '), c.stdin])).toEqual([
      ['wrangler', 'secret put DEMO_SECRET_KEY --env test', SECRET],
      ['wrangler', 'secret put DEMO_SECRET_KEY --env production', PROD_SECRET],
    ])
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain(PROD_SECRET)
  })
})
