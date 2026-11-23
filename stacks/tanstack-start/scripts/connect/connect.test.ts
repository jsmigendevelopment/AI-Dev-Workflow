import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEMO, typed, world } from './fakes'
import { parseProvider, plain, readSteps } from './providers'
import { connect } from './run'
import { envLine, upsertEnv } from './store'

const SECRET = 'sk_test_TOPSECRET_9f3a1c'
const PROD_SECRET = 'sk_live_PRODSECRET_77aa'
// Open the page?, the secret, three saves, production?, the public value, its save.
const FULL = typed('n', SECRET, 'y', 'y', 'y', 'n', 'pub-1', 'y')

let w: ReturnType<typeof world>
beforeEach(() => (w = world()))
afterEach(() => w.cleanup())

describe('pnpm connect', () => {
  it('lists only the providers the app needs, and what is set, by name', async () => {
    const { code, text } = await w.run(['--dry-run'])
    expect(code).toBe(0)
    expect(text).toContain('Demo')
    expect(text).not.toContain('Other')
    expect(text).toContain('GitHub repository: acme/app (from the origin remote).')
    expect(text).toContain('Not asked here (setup-cloudflare, wrangler.jsonc vars, or by hand): UNOWNED')
    expect(text).toMatch(/DEMO_SECRET_KEY: \.env\.local ✗, Cloudflare test ✗, GitHub test \(secret\) ✗/)
  })

  it('writes nothing in a dry run, and reads no input', async () => {
    const { text } = await w.run(['--dry-run'], typed('y', 'y'))
    expect(text).toContain('A real run would ask for')
    expect(text).toContain(
      'DEMO_SECRET_KEY for production → Cloudflare production, GitHub production (secret)',
    )
    expect(w.writes()).toEqual([])
    expect(() => w.envLocal()).toThrow()
    expect(w.rawModes).toEqual([])
  })

  it('stores a value only through stdin and the file, never in output or any argv', async () => {
    const { code, text } = await w.run([], FULL)
    expect(code).toBe(0)
    expect(text).not.toContain(SECRET)
    for (const call of w.calls()) expect(call.argv.join(' ')).not.toContain(SECRET)
    expect(w.writes().map((c) => [c.cmd, c.argv.join(' '), c.stdin])).toEqual([
      ['wrangler', 'secret put DEMO_SECRET_KEY --env test', SECRET],
      ['gh', 'secret set DEMO_SECRET_KEY --env test -R acme/app', SECRET],
    ])
    expect(w.envLocal()).toBe(`DEMO_SECRET_KEY=${SECRET}\nDEMO_PUBLIC_ID=pub-1\n`)
    expect(text).toContain('You entered: pub-1')
    expect(text).not.toContain(
      'DEMO_PUBLIC_ID for local (hidden as you type or paste; Enter alone skips): pub-1',
    )
    expect(statSync(join(w.dir, '.env.local')).mode & 0o777).toBe(0o600)
    expect(w.rawModes.at(-1)).toBe(false)
  })

  it('scrubs the value from a failing command’s error', async () => {
    const { code, text } = await w.run([], FULL, { FAKE_FAIL: 'gh:secret:test' })
    expect(code).toBe(1)
    expect(text).toContain(
      '✗ DEMO_SECRET_KEY → GitHub test (secret): gh exited with code 1. Run `gh secret set DEMO_SECRET_KEY --env test -R acme/app` yourself to see why.',
    )
    expect(text).not.toContain('boom')
    expect(text).not.toContain(SECRET)
  })

  it('skips a destination the person says no to', async () => {
    await w.run([], typed('n', SECRET, 'y', 'n', 'y', 'n', ''))
    expect(w.writes().map((c) => c.cmd)).toEqual(['gh'])
    expect(w.envLocal()).toContain('DEMO_SECRET_KEY=')
  })

  it('rejects a value with the wrong shape without echoing it', async () => {
    const { text } = await w.run([], typed('n', 'pk_wrong_value_123', '', 'n', ''))
    expect(text).toContain('DEMO_SECRET_KEY should start with sk_test_. Nothing was saved.')
    expect(text).not.toContain('pk_wrong_value_123')
    expect(w.writes()).toEqual([])
  })

  it('skips what is already set on a rerun, unless --force', async () => {
    await w.run([], FULL)
    const again = await w.run([])
    expect(again.text).toContain('DEMO_SECRET_KEY: .env.local ✓, Cloudflare test ✓, GitHub test (secret) ✓')
    expect(again.text).toContain('Open https://demo.example.com/keys') // production is still missing
    expect(w.writes()).toHaveLength(2)
    const forced = await w.run(['--force', '--dry-run'])
    expect(forced.text).toContain(
      'DEMO_SECRET_KEY for local and test → .env.local, Cloudflare test, GitHub test',
    )
  })

  it('asks for production separately, with the always-stop reminder', async () => {
    const { text } = await w.run([], typed('n', '', 'y', PROD_SECRET, 'y', 'y', ''))
    expect(text).toContain('Production is on the always-stop list')
    expect(text).not.toContain(PROD_SECRET)
    expect(w.writes().map((c) => [c.argv.join(' '), c.stdin])).toEqual([
      ['secret put DEMO_SECRET_KEY --env production', PROD_SECRET],
      ['secret set DEMO_SECRET_KEY --env production -R acme/app', PROD_SECRET],
    ])
  })

  it('does just one provider when named, and refuses an unknown one', async () => {
    const { text } = await w.run(['other', '--dry-run'])
    expect(text).toContain('OTHER_SECRET_KEY')
    expect(text).not.toContain('DEMO_SECRET_KEY')
    expect((await w.run(['nope', '--dry-run'])).code).toBe(2)
  })

  it('opens a page only after a yes, and only the https page from the block', async () => {
    await w.run([], typed('n'))
    expect(w.calls().filter((c) => c.cmd === 'xdg-open')).toEqual([])
    await w.run([], typed('y'))
    expect(
      w
        .calls()
        .filter((c) => c.cmd === 'xdg-open')
        .map((c) => c.argv),
    ).toEqual([['https://demo.example.com/keys']])
  })

  it('refuses to run without a terminal, except as a dry run', async () => {
    const out: string[] = []
    const code = await connect([], {
      stdin: new PassThrough(),
      stdout: { write: (t: string) => out.push(t) },
      cwd: w.dir,
      platform: 'linux',
      env: {},
    })
    expect(code).toBe(2)
    expect(out.join('')).toContain('run it in your own terminal')
  })
})

describe('provider files', () => {
  it('reads the connect block and the short steps, without commands that store a value', () => {
    const p = parseProvider('demo', DEMO)!
    const section = p.sections.DEMO_SECRET_KEY!
    expect(section.heading).toBe('Keys · about 4 minutes')
    expect(section.url).toBe('https://demo.example.com/keys')
    expect(section.steps.map((s) => [s.text, s.copy, s.unverified])).toEqual([
      ['Open the Keys page.', [], false],
      ['Paste this callback:', ['https://demo.example.com/callback'], true],
      ['Store it:', [], false],
    ])
    expect(section.done).toBe('the demo says hello.')
    expect(readSteps(DEMO, '## Why').steps).toHaveLength(1)
  })

  it('keeps the space between a word and a code span', () => {
    expect(plain('Copy it into `.env.local`, then run `node .agents/skills/x.mjs`. `[V]`')).toBe(
      'Copy it into .env.local, then run node .agents/skills/x.mjs.',
    )
    expect(plain('Sign in `[U]`.')).toBe('Sign in.')
  })

  it('rejects a malformed block with the file’s name', () => {
    expect(() => parseProvider('bad', '```json connect\n{ nope }\n```')).toThrow(/providers\/bad\.md/)
    expect(parseProvider('none', '# No block')).toBeNull()
  })

  it('takes only https pages, for the provider and for each variable', () => {
    expect(() =>
      parseProvider('demo', DEMO.replace('https://demo.example.com/keys', 'http://x.example')),
    ).toThrow(/https "url"/)
    const perVar = DEMO.replace('"min": 12 }', '"min": 12 }, "url": "javascript:alert(1)"')
    expect(() => parseProvider('demo', perVar)).toThrow(/https "url" for DEMO_SECRET_KEY/)
  })
})

describe('.env files', () => {
  it('quotes only when needed, and replaces a line in place', () => {
    expect(envLine('A', 'pk_test_x')).toBe('A=pk_test_x')
    expect(envLine('A', 'Acme <hi@x.com>')).toBe("A='Acme <hi@x.com>'")
    expect(envLine('A', `it's\n"x"`)).toBeNull()
    const file = join(w.dir, '.env.local')
    writeFileSync(file, '# keep\nA=old\nB="multi\nline"\nC=keep\n')
    upsertEnv(file, 'B', 'new', 'linux')
    upsertEnv(file, 'A', 'next', 'linux')
    expect(readFileSync(file, 'utf8')).toBe('# keep\nC=keep\nB=new\nA=next\n')
  })
})
