// #444: on ci = "local" the Sentry add-on's deploy values live in .env.sentry.local, which both
// deploys load (decision 227-2). The prompt names that group by where it is used.
import { afterEach, describe, expect, it } from 'vitest'

import { DEMO, typed, world } from './fakes'

// Sentry's three deploy values, shaped as its connect block has them: a local file and GitHub.
const deployVar = (secret: boolean) =>
  `{ "secret": ${secret}, "scope": ["local", "test", "production"], "to": [".env.sentry.local", "github"] }`
const SENTRY = DEMO.replace('"Demo"', '"Sentry"').replace(
  /"vars": \{[\s\S]*?\n {2}\}/,
  `"vars": {
    "SENTRY_AUTH_TOKEN": ${deployVar(true)},
    "SENTRY_ORG": ${deployVar(false)},
    "SENTRY_PROJECT": ${deployVar(false)}
  }`,
)
const NAMES = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']
const prompt = (name: string, group: string) =>
  `Paste ${name} for ${group} (hidden as you type or paste; Enter alone skips)`

let w: ReturnType<typeof world>
afterEach(() => w.cleanup())

describe('pnpm connect sentry names the group by where the value goes', () => {
  it('AC-444-1: WHEN pnpm connect sentry runs on ci = "local" THEN each prompt says every deploy (test and production)', async () => {
    w = world({ ci: 'local' })
    w.provider('sentry', SENTRY)
    // Open the page?, then Enter skips each of the three values: nothing is written.
    const { code, text } = await w.run(['sentry'], typed('n', '', '', ''))
    expect(code).toBe(0)
    for (const name of NAMES) {
      expect(text).toContain(prompt(name, 'every deploy (test and production)'))
      expect(text).not.toContain(prompt(name, 'local and test'))
    }
    expect(w.writes()).toEqual([])
  })

  it.each(['environment', 'repository'])(
    'AC-444-2: WHEN pnpm connect sentry runs on ci = "actions" (%s mode) THEN the prompts stay as they are today',
    async (mode) => {
      w = world()
      w.provider('sentry', SENTRY)
      // Open the page?, then for each value: Enter skips local and test, no to production.
      const answers = typed('n', '', 'n', '', 'n', '', 'n')
      const { code, text } = await w.run(['sentry'], answers, { FAKE_SECRETS_MODE: mode })
      expect(code).toBe(0)
      for (const name of NAMES) expect(text).toContain(prompt(name, 'local and test'))
      expect(text).not.toContain('every deploy')
      expect(w.writes()).toEqual([])
    },
  )
})
