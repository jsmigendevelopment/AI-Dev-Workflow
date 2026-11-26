// #139: what setup-cloudflare makes for the smoke tests (the Access service token, the test site's
// password) goes to .env.cloudflare.local, where the session deploys read it, never to the screen.
// On ci = "local" nothing goes to GitHub; ci = "actions" keeps the GitHub copies (protection.test.ts).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { attempt, freshPlace } from '../deploy/fakes'
import { deployTest } from '../deploy/test-site'
import { ciFrom, readCi } from './ci-mode'
import { freshWorld, PACK_CONFIG, run, zeroTrust } from './fakes'
import { localFileProblem, saveLocalValue } from './local-env'

const ACCESS = { CLOUDFLARE_ACCESS_TOKEN: 'set' }
const TOKEN_SECRET = 'cfast_SECRET' // what the fake Cloudflare API answers for a new service token
const PASSWORD = 'Zx81_random-SECRET-value-0123456' // the fakes' randomSecret()
const github = (calls: string[]) => calls.filter((c) => c.startsWith('gh '))
/** docs/stack.md text → the CI it names. A trailing comment is fine; a commented-out line isn't. */
const CI_CASES: [string, 'actions' | 'local'][] = [
  ['## CI\n\nci = "actions"\n', 'actions'],
  ['ci="actions"', 'actions'],
  ['ci = "actions"  # turned on by the person\n', 'actions'],
  ['ci = "actions"\r\n', 'actions'],
  ['ci = "local"\n', 'local'],
  ['', 'local'],
  ['# ci = "actions" was turned off\nci = "local"\n', 'local'],
  ['ci = "actions-later"\n', 'local'],
]

/** Everything written to the real stdout and stderr while `fn` runs. */
async function printed<T>(fn: () => Promise<T>): Promise<{ result: T; text: string }> {
  const chunks: string[] = []
  const grab = (chunk: string | Uint8Array) => (chunks.push(String(chunk)), true)
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(grab)
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(grab)
  try {
    return { result: await fn(), text: chunks.join('') }
  } finally {
    out.mockRestore()
    err.mockRestore()
  }
}

describe('setup-cloudflare saves the smoke tests’ values in .env.cloudflare.local', () => {
  it('AC-139-1: WHEN setup-cloudflare makes an Access service token THEN its id and secret are in .env.cloudflare.local as TEST_CF_ACCESS_CLIENT_ID and TEST_CF_ACCESS_CLIENT_SECRET, and never printed', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const opts = { protect: 'access' as const, allowEmails: ['ann@example.com'] }
    const { result, text } = await printed(() => run(world, files, opts, ACCESS))
    expect(result.code).toBe(0)
    expect(result.saved).toEqual({
      TEST_CF_ACCESS_CLIENT_ID: 'id.access',
      TEST_CF_ACCESS_CLIENT_SECRET: TOKEN_SECRET,
    })
    expect(result.output()).toContain(
      'saved TEST_CF_ACCESS_CLIENT_ID and TEST_CF_ACCESS_CLIENT_SECRET in .env.cloudflare.local',
    )
    for (const shown of [result.output(), result.calls.join('\n'), text, files['wrangler.jsonc']!])
      expect(shown).not.toContain(TOKEN_SECRET)
  })

  it('AC-139-2: WHEN pnpm deploy:test runs after a fresh setup with Access THEN its smoke test gets in without any value typed by hand', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const setup = await run(world, files, { protect: 'access', allowEmails: ['ann@example.com'] }, ACCESS)
    expect(setup.code).toBe(0)
    // The deploy reads the same file setup-cloudflare wrote, and nothing else.
    const place = freshPlace({ files: { 'wrangler.jsonc': files['wrangler.jsonc']! }, local: setup.saved })
    const deploy = await attempt(place, deployTest)
    expect(deploy.code).toBe(0)
    const smoke = deploy.calls.find((c) => c.endsWith('pnpm test:deployed'))
    expect(smoke).toContain('CF_ACCESS_CLIENT_ID=id.access')
    expect(smoke).toContain(`CF_ACCESS_CLIENT_SECRET=${TOKEN_SECRET}`)
    expect(deploy.output()).toContain('Smoke test passed.')
    expect(deploy.output()).not.toContain(TOKEN_SECRET)
  })

  it('on ci = "local", writes nothing to GitHub and never asks gh, in a dry run or a real one', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const opts = { protect: 'access' as const, allowEmails: ['ann@example.com'] }
    const dry = await run(world, files, { ...opts, dryRun: true }, ACCESS)
    expect(github(dry.calls)).toEqual([])
    expect(dry.output()).toContain('nothing goes to GitHub')
    expect(dry.output()).not.toContain('GitHub environment')
    const real = await run(world, files, { ...opts, ci: 'local' }, ACCESS)
    expect(github(real.calls)).toEqual([])
    expect(real.output()).not.toContain('CLOUDFLARE_ACCOUNT_ID')
  })

  it('password: saves TEST_SITE_PASSWORD, sets it on the test Worker, and never prints it', async () => {
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const { result, text } = await printed(() => run(freshWorld(), files, { protect: 'password' }))
    expect(result.saved).toEqual({ TEST_SITE_PASSWORD: PASSWORD })
    expect(result.calls).toContain('wrangler secret put SITE_PASSWORD --env test <stdin>')
    expect(result.stdin).toEqual([PASSWORD]) // the Worker only
    expect(github(result.calls)).toEqual([])
    expect(result.output()).toContain('opens .env.cloudflare.local to read the password')
    for (const shown of [result.output(), result.calls.join('\n'), text])
      expect(shown).not.toContain(PASSWORD)
  })

  it('production: the token goes in as PRODUCTION_ names, never TEST_ ones', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const opts = { protectProduction: 'all', allowEmails: ['ann@example.com'], productionOk: true }
    const { saved, calls, output } = await run(world, files, opts, ACCESS)
    expect(saved).toEqual({
      PRODUCTION_CF_ACCESS_CLIENT_ID: 'id.access',
      PRODUCTION_CF_ACCESS_CLIENT_SECRET: TOKEN_SECRET,
    })
    expect(github(calls)).toEqual([])
    expect(output()).toContain('PRODUCTION_CF_ACCESS_CLIENT_SECRET in .env.cloudflare.local')
  })

  it('makes no token or password when .env.cloudflare.local is not git-ignored, and says why', async () => {
    const world = { ...freshWorld(), access: zeroTrust(), localNotIgnored: true }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const access = await run(world, files, { protect: 'access', allowEmails: ['ann@example.com'] }, ACCESS)
    expect(access.writes.filter((w) => w.path.endsWith('/service_tokens'))).toEqual([])
    expect(access.output()).toContain("isn't git-ignored")
    const password = await run(world, files, { protect: 'password' })
    expect(password.calls.some((c) => c.includes('secret put'))).toBe(false)
    expect(Object.keys(password.saved)).toEqual([])
  })
})

describe('the file itself', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

  /** A real git repository that ignores .env.* the way the pack's .gitignore does. */
  function repository(ignore = '.env.*\n') {
    const dir = mkdtempSync(join(tmpdir(), 'local-keys-'))
    dirs.push(dir)
    execFileSync('git', ['init', '-q', dir])
    writeFileSync(join(dir, '.gitignore'), ignore)
    return dir
  }

  it.skipIf(process.platform === 'win32')(
    'is owner-only (mode 600), keeps other lines, replaces an old value, and prints nothing',
    async () => {
      const dir = repository()
      const file = join(dir, '.env.cloudflare.local')
      writeFileSync(file, 'CLOUDFLARE_ACCESS_TOKEN=keep-me\nTEST_SITE_PASSWORD=old\n', { mode: 0o644 })
      expect(localFileProblem(file, dir)).toBeNull()
      const { result, text } = await printed(() =>
        Promise.resolve([
          saveLocalValue('TEST_SITE_PASSWORD', 'new-DO_NOT_PRINT', file),
          saveLocalValue('TEST_CF_ACCESS_CLIENT_SECRET', 'tok-DO_NOT_PRINT', file),
        ]),
      )
      expect(result).toEqual([true, true])
      expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(readFileSync(file, 'utf8')).toBe(
        'CLOUDFLARE_ACCESS_TOKEN=keep-me\nTEST_SITE_PASSWORD=new-DO_NOT_PRINT\nTEST_CF_ACCESS_CLIENT_SECRET=tok-DO_NOT_PRINT\n',
      )
      expect(text).not.toContain('DO_NOT_PRINT')
    },
  )

  it('refuses a file it can’t write, and a real run makes the file owner-only before any value', () => {
    const dir = repository()
    const file = join(dir, '.env.cloudflare.local')
    expect(localFileProblem(file, dir, false)).toBeNull()
    expect(existsSync(file)).toBe(false) // a dry run only reads
    expect(localFileProblem(file, dir, true)).toBeNull()
    expect(readFileSync(file, 'utf8')).toBe('')
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    const folder = join(dir, 'folder')
    mkdirSync(join(folder, '.env.cloudflare.local'), { recursive: true })
    expect(localFileProblem(join(folder, '.env.cloudflare.local'), dir, true)).toContain("can't be written")
  })

  it('refuses a file git does not ignore', () => {
    const dir = repository('node_modules\n')
    expect(localFileProblem(join(dir, '.env.cloudflare.local'), dir)).toContain("isn't git-ignored")
  })
})

describe('ci in docs/stack.md', () => {
  // The same cases as cli/test/ci-local-secrets.test.mjs runs against push-secrets and setup-github.
  it.each(CI_CASES)('%j reads as %s', (stack, ci) => expect(ciFrom(stack)).toBe(ci))

  it('reads the nearest docs/stack.md up to the repository root; none means local', () => {
    const root = mkdtempSync(join(tmpdir(), 'ci-mode-'))
    try {
      mkdirSync(join(root, '.git'))
      mkdirSync(join(root, 'apps', 'web'), { recursive: true })
      expect(readCi(join(root, 'apps', 'web'))).toBe('local')
      mkdirSync(join(root, 'docs'))
      writeFileSync(join(root, 'docs', 'stack.md'), 'ci = "actions"\n')
      expect(readCi(join(root, 'apps', 'web'))).toBe('actions')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('without a .git yet, reads only the app folder, never a docs/stack.md above it', () => {
    const outer = mkdtempSync(join(tmpdir(), 'ci-mode-'))
    try {
      mkdirSync(join(outer, 'docs'))
      writeFileSync(join(outer, 'docs', 'stack.md'), 'ci = "actions"\n')
      mkdirSync(join(outer, 'app'))
      expect(readCi(join(outer, 'app'))).toBe('local')
      expect(readCi(outer)).toBe('actions')
    } finally {
      rmSync(outer, { recursive: true, force: true })
    }
  })
})
