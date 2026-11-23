// The security review's findings for #36, one describe each. Every test fails without its guard.
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEMO, typed, world } from './fakes'
import { looksSecret, parseProvider, prefixesFor, shapeProblem } from './providers'
import { cmdArg, plan } from './shell'

const PEM_PROVIDER = `# Pem

\`\`\`json connect
{ "title": "Pem", "url": "https://pem.example.com/keys", "vars": { "PEM_KEY": { "secret": true, "scope": ["local"], "to": [".env.local"], "shape": { "prefix": ["-----BEGIN PUBLIC KEY-----"] } } } }
\`\`\`

## 1. Go

1. Copy the key.
`
const BODY = 'MIIBSECRETBODYLINE'
const PEM = `-----BEGIN PUBLIC KEY-----\n${BODY}\n-----END PUBLIC KEY-----`

let w: ReturnType<typeof world>
beforeEach(() => (w = world()))
afterEach(() => w.cleanup())

describe('1. nothing typed or pasted is echoed by a later prompt', () => {
  it('drops a pasted line left over after a hidden answer', async () => {
    const { text } = await w.run(
      [],
      ['n\r', 'sk_test_FIRSTLINE_1\rLEFTOVER_LINE\r', ...typed('y', 'n', 'n', 'n', '')],
    )
    expect(text).not.toContain('LEFTOVER_LINE')
    expect(w.envLocal()).toBe('DEMO_SECRET_KEY=sk_test_FIRSTLINE_1\n')
  })

  it('never takes typing from before a question as its answer', async () => {
    await w.run([], ['n\r', 'sk_test_FIRSTLINE_1\ry\r', ...typed('n', 'n', 'n', 'n', '')])
    expect(existsSync(join(w.dir, '.env.local'))).toBe(false)
    expect(w.writes()).toEqual([])
  })

  it('reads a PEM key pasted without bracketed paste to its END line, showing none of it', async () => {
    w.provider('pem', PEM_PROVIDER)
    const { text } = await w.run(['pem'], ['n\r', `${PEM.replace(/\n/g, '\r')}\r`, 'y\r'])
    expect(text).not.toContain(BODY)
    expect(w.envLocal()).toBe(`PEM_KEY="${PEM}"\n`)
  })

  it('keeps a bracketed paste whole, and refuses a PEM whose END does not match its BEGIN', async () => {
    w.provider('pem', PEM_PROVIDER)
    const bad = PEM.replace('END PUBLIC', 'END PRIVATE')
    const { text } = await w.run(['pem'], ['n\r', `\x1b[200~${bad.replace(/\n/g, '\r\n')}\x1b[201~\r`, '\r'])
    expect(text).toContain(
      'PEM_KEY should be one block from -----BEGIN PUBLIC KEY----- to -----END PUBLIC KEY-----.',
    )
    expect(text).not.toContain(BODY)
    expect(existsSync(join(w.dir, '.env.local'))).toBe(false)
  })

  it('hides a key pasted at a y/N question, says so, and asks again', async () => {
    const pasted = 'sk_live_PASTEDATCONFIRM'
    const { text } = await w.run([], ['n\r', '\r', `${pasted}\r`, 'n\r', '\r'])
    expect(text).not.toContain(pasted)
    expect(text).toContain('That looked like a key; nothing was saved. Answer y or n.')
    expect(w.writes()).toEqual([])
  })

  it('shows a plain yes at a y/N question', async () => {
    const { text } = await w.run([], typed('yes'))
    expect(text).toContain('in your browser? [y/N] yes')
  })
})

describe('2. test and live keys stay in their own environments', () => {
  it('refuses a live key for local and test, and a test key for production', async () => {
    const answers = typed('n', 'sk_live_LIVEKEY_1234', '', 'y', 'sk_test_TESTKEY_1234', '', '')
    const { text } = await w.run([], answers)
    expect(text).toContain(
      'DEMO_SECRET_KEY for local and test must be a test key: sk_live_ keys go only in production.',
    )
    expect(text).toContain('DEMO_SECRET_KEY for production must be a live key, not sk_test_.')
    expect(w.writes()).toEqual([])
    expect(existsSync(join(w.dir, '.env.local'))).toBe(false)
  })

  it('splits the real Stripe and Clerk prefixes by group', () => {
    const shape = { prefix: ['sk_test_', 'rk_test_', 'sk_live_', 'rk_live_'] }
    expect(prefixesFor(shape, 'local and test')).toEqual(['sk_test_', 'rk_test_'])
    expect(prefixesFor(shape, 'production')).toEqual(['sk_live_', 'rk_live_'])
  })
})

describe('3. files stay inside the repository and git-ignored', () => {
  it('rejects a destination that climbs out or is absolute', () => {
    for (const to of ['../../../outside/.env', '/etc/.env', 'apps/../../.env', 'C:\\\\x\\\\.env'])
      expect(
        () => parseProvider('demo', DEMO.replace('".env.local", "wrangler"', `"${to}", "wrangler"`)),
        to,
      ).toThrow(/bad destination/)
  })

  it('stops before asking anything when a provider file names such a destination', async () => {
    w.provider('demo', DEMO.replace('".env.local", "wrangler"', '"../../../outside/.env", "wrangler"'))
    const { code, text } = await w.run([], typed('n'))
    expect(code).toBe(2)
    expect(text).toContain('Stopped: providers/demo.md: the connect block has a bad destination')
    expect(w.rawModes).toEqual([])
  })

  it('refuses a symlink that leads outside the repository', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'outside-'))
    writeFileSync(join(outside, '.env'), 'UNTOUCHED=1\n')
    symlinkSync(join(outside, '.env'), join(w.dir, '.env.local'))
    const { text } = await w.run(['--force'], typed('n', 'sk_test_SYMLINKED_1', 'y', 'n', 'n', 'n', ''))
    expect(text).toContain('.env.local resolves outside the repository, so nothing was written.')
    expect(readFileSync(join(outside, '.env'), 'utf8')).toBe('UNTOUCHED=1\n')
    rmSync(outside, { recursive: true, force: true })
  })

  it('refuses a file git does not ignore, in a real repository', async () => {
    const tracked = world({ ignore: 'node_modules\n' })
    const { text } = await tracked.run([], typed('n', 'sk_test_NOTIGNORED1', 'y', 'n', 'n', 'n', ''))
    expect(text).toContain(".env.local isn't git-ignored, so nothing was written.")
    expect(existsSync(join(tracked.dir, '.env.local'))).toBe(false)
    tracked.cleanup()
  })

  it('refuses to write when git cannot confirm the file is ignored', async () => {
    const bare = world({ git: false })
    const { text } = await bare.run([], typed('n', 'sk_test_NOGITREPO1', 'y', 'n', 'y', 'n', ''))
    expect(text).toContain("git couldn't confirm that .env.local is git-ignored")
    expect(text).toContain("the origin remote isn't on github.com")
    expect(existsSync(join(bare.dir, '.env.local'))).toBe(false)
    expect(bare.writes().filter((c) => c.cmd === 'gh')).toEqual([])
    bare.cleanup()
  })
})

describe('4. every gh call is pinned to the origin repository', () => {
  it('passes -R owner/repo, names it in the question, and drops an inherited GH_REPO', async () => {
    const { text } = await w.run([], typed('n', 'sk_test_PINNED_123', 'n', 'n', 'y', 'n', ''), {
      GH_REPO: 'attacker/repo',
    })
    expect(text).toContain('Set DEMO_SECRET_KEY as GitHub secret in env `test` of acme/app?')
    const gh = w.calls().filter((c) => c.cmd === 'gh')
    expect(gh.length).toBeGreaterThan(1)
    for (const call of gh) {
      expect(call.argv.slice(-2)).toEqual(['-R', 'acme/app'])
      expect(call.ghRepo).toBeUndefined()
    }
  })
})

describe('5. provider text cannot drive the terminal', () => {
  it('strips OSC, CSI and other control characters from everything printed', async () => {
    const evil = DEMO.replace('"Demo"', '"Demo\\u001b]0;pwned\\u0007\\u001b[2K"').replace(
      'Open the **Keys** page.',
      'Open \x1b]8;;https://evil.example\x07this\x1b]8;;\x07 page.\x1b[31m',
    )
    w.provider('demo', evil)
    const dry = await w.run(['--dry-run'])
    const live = await w.run([], typed('n'))
    for (const text of [dry.text, live.text]) {
      expect(text).toContain('Demo')
      expect(text.includes('\x07') || text.includes('\x1b')).toBe(false)
    }
    expect(live.text).toContain('Open this page.')
  })
})

describe('6. Windows: a shell only for .cmd shims, with every metacharacter escaped', () => {
  const env = { PATH: 'C:\\bin;C:\\tools', PATHEXT: '.EXE;.CMD' }

  it('runs git, node and .exe files without a shell', () => {
    expect(plan('git', ['-C', 'a b'], 'win32', env, () => true)).toEqual({
      file: 'git',
      args: ['-C', 'a b'],
      verbatim: false,
    })
    expect(plan('gh', ['secret', 'list'], 'win32', env, (p) => p === 'C:\\tools\\gh.EXE').verbatim).toBe(
      false,
    )
    expect(plan('wrangler', ['x&y'], 'linux', env).args).toEqual(['x&y'])
  })

  it('runs a .cmd shim through cmd.exe with each argument quoted and escaped twice', () => {
    const p = plan('wrangler', ['secret', 'A&B|C'], 'win32', env, (f) => f === 'C:\\bin\\wrangler.CMD')
    expect(p.file).toBe('cmd.exe')
    expect(p.verbatim).toBe(true)
    expect(p.args).toEqual([
      '/d',
      '/s',
      '/c',
      '"^"C:\\bin\\wrangler.CMD^" ^^^"secret^^^" ^^^"A^^^&B^^^|C^^^""',
    ])
  })

  it('leaves no cmd.exe metacharacter unescaped', () => {
    const arg = cmdArg('& | < > ^ % ! ( ) " x', true)
    expect(arg.replace(/\^\^\^./g, '')).not.toMatch(/[&|<>^%!()" ]/)
  })
})

describe('7. a status that could not be read is not taken as missing', () => {
  it('warns, names it in the question, and still asks before writing', async () => {
    const { text } = await w.run([], typed('n', 'sk_test_UNKNOWN_12', 'n', 'n', 'n', 'n', ''), {
      FAKE_LIST_FAIL: 'gh',
    })
    expect(text).toContain(
      "⚠ DEMO_SECRET_KEY: couldn't check whether it's already set in GitHub test (secret)",
    )
    expect(text).toContain("of acme/app (couldn't check whether it's already set; this may replace it)?")
    expect(w.writes()).toEqual([])
  })
})

// Second review.
describe('R2-1. public values are read hidden, and a secret pasted there is refused', () => {
  it('never shows a key pasted at a public question, and shows a public value only afterwards', async () => {
    const misplaced = 'sk_test_MISPLACED_KEY_1'
    const token = 'A'.repeat(40)
    const { text } = await w.run([], typed('n', '', 'n', misplaced, token, 'pub-1', 'y'))
    expect(text).not.toContain(misplaced)
    expect(text).not.toContain(token)
    expect(text.split('That looks like a secret key, not DEMO_PUBLIC_ID. Nothing was saved.')).toHaveLength(3)
    expect(text).toContain('You entered: pub-1')
    expect(w.envLocal()).toBe('DEMO_PUBLIC_ID=pub-1\n')
  })

  it('knows secret shapes from every provider, and trusts a variable’s own prefix', () => {
    const known = ['sk_', 'whsec_', 're_']
    for (const v of [
      'whsec_abc',
      're_123',
      '-----BEGIN PRIVATE KEY-----',
      '1x0000000000000000000000000000000AA',
    ])
      expect(looksSecret(v, undefined, known), v).toBe(true)
    for (const v of [
      'Acme <hi@x.com>',
      '1234-abc.apps.googleusercontent.com',
      'acme-org',
      '0f8fad5b-d9cb-469f-a165-70867728950e',
    ])
      expect(looksSecret(v, undefined, known), v).toBe(false)
    expect(looksSecret(`pk_test_${'Y'.repeat(40)}`, { prefix: ['pk_test_'] }, known)).toBe(false)
  })
})

describe('R2-2. documented test values are refused in production', () => {
  const turnstile = { notInProduction: ['1x0000', '2x0000', '3x0000'] }
  it('refuses Cloudflare’s always-pass Turnstile keys for production only', () => {
    for (const v of [
      '1x0000000000000000000000000000000AA',
      '2x0000000000000000000000000000000AA',
      '3x00000000000000000000FF',
    ])
      expect(shapeProblem('TURNSTILE_SECRET_KEY', v, turnstile, 'production')).toContain(
        "can't be a documented test value",
      )
    expect(
      shapeProblem('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA', turnstile, 'local'),
    ).toBeNull()
    expect(shapeProblem('TURNSTILE_SECRET_KEY', '0x4AAAAAAAreal', turnstile, 'production')).toBeNull()
  })
})

describe('R2-4. guards that each test pins down', () => {
  it('refuses a multi-line value for a variable that is not a PEM key', async () => {
    const { text } = await w.run(
      [],
      ['n\r', '\x1b[200~sk_test_line1\r\nline2\x1b[201~\r', ...typed('', 'n', '')],
    )
    expect(text).toContain('DEMO_SECRET_KEY should be one line.')
    expect(w.writes()).toEqual([])
  })

  it('ends a non-PEM answer at Enter even when it starts like a PEM block', async () => {
    const { text } = await w.run([], ['n\r', '-----BEGIN X-----\r', ...typed('', 'n', '')])
    expect(text).toContain('DEMO_SECRET_KEY should start with sk_test_.')
  }, 3000)

  it('makes an existing .env.local owner-only', async () => {
    writeFileSync(join(w.dir, '.env.local'), 'OTHER=1\n')
    chmodSync(join(w.dir, '.env.local'), 0o644)
    await w.run([], typed('n', 'sk_test_CHMOD_12345', 'y', 'n', 'n', 'n', ''))
    expect(statSync(join(w.dir, '.env.local')).mode & 0o777).toBe(0o600)
  })
})
