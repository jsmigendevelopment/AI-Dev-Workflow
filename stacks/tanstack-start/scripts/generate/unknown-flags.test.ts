// Every generator refuses a `--flag` it doesn't take (#710, AC-710-7), before anything else: one
// line, exit 1, nothing written, no tool run. An ignored flag would run for real, and a flag
// before the words would otherwise shift them. The `--dry` look-alikes get a friendlier line.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DID_YOU_MEAN,
  generate,
  GENERATORS,
  MOD,
  scratch,
  section,
  snapshot,
  withScratchApps,
} from './harness.ts'

withScratchApps()

const MODULE_FLAGS = '--dry, --item <singular>, --no-route'
const UNKNOWN = (flag: string, known: string) => `Unknown flag ${flag}. Known flags: ${known}.\n`

/** The generators, each with the flags it takes, plus `pnpm routes:generate`. */
const TARGETS = [
  ...GENERATORS.map((g) => ({
    ...g,
    known: g.script === 'new-module.ts' ? MODULE_FLAGS : '--dry',
    scratchApp: () => scratch(g.withModule),
  })),
  {
    name: 'routes:generate',
    script: 'routes.ts',
    args: [] as string[],
    withModule: false,
    known: '--dry',
    // A route the tree doesn't list yet, so an ignored flag would rewrite it.
    scratchApp: () => {
      const dir = scratch(false)
      writeFileSync(
        join(dir, 'src/routes/dry-extra.tsx'),
        "import { createFileRoute } from '@tanstack/react-router'\n\nexport const Route = createFileRoute('/dry-extra')({\n  component: () => null,\n})\n",
      )
      return dir
    },
  },
]

type Place = [where: string, build: (flags: string[], words: string[]) => string[]]
const PLACES: Place[] = [
  ['before the words', (flags, words) => [...flags, ...words]],
  ['after the words', (flags, words) => [...words, ...flags]],
]

describe.each(TARGETS)('$name refuses a flag it does not take (AC-710-7)', (target) => {
  const refuses = (flags: string[], says: string, build: Place[1]) => {
    const dir = target.scratchApp()
    const before = snapshot(dir)
    const run = generate(dir, target.script, build(flags, target.args))
    expect(run.status).toBe(1)
    expect(run.stderr).toBe(says)
    expect(run.stdout).toBe('')
    expect(snapshot(dir)).toEqual(before)
    expect(run.pnpmCalls).toBe('')
  }

  // Look-alikes of --dry that the person means as a dry run: named, with the right spelling.
  const LOOK_ALIKES = ['--dry-mode', '--dry-', '--dry-runn', '--dry-run-only', '--dry:run', '--dry ']
  it.each(LOOK_ALIKES.flatMap((f) => PLACES.map(([where, build]) => [f, where, build] as const)))(
    '%j %s: the Did you mean --dry? line, nothing written, no tool run',
    (flag, _where, build) => refuses([flag], DID_YOU_MEAN(flag), build),
  )

  // Any other flag: not a dry run, just not one this generator takes.
  const OTHERS = ['--no-dry', '--plan', '--preview', '--check', '--dr', '--item=x', '---x']
  it.each(OTHERS.flatMap((f) => PLACES.map(([where, build]) => [f, where, build] as const)))(
    '%j %s: names the flag and the flags it takes, nothing written, no tool run',
    (flag, _where, build) => refuses([flag], UNKNOWN(flag, target.known), build),
  )

  it.each(PLACES)('--foo bar %s: refused at --foo, "bar" is never taken as a name', (_where, build) =>
    refuses(['--foo', 'bar'], UNKNOWN('--foo', target.known), build),
  )

  it('refuses before any other check, so a bad name or a missing word never hides it', () => {
    refuses(['--plan'], UNKNOWN('--plan', target.known), () => ['Bad_Name', '--plan'])
    refuses(['--plan'], UNKNOWN('--plan', target.known), () => ['--plan'])
  })
})

describe('--no-route is a flag of new:module only (AC-710-7)', () => {
  const OTHER_GENERATORS = TARGETS.filter((t) => t.script !== 'new-module.ts')

  it.each(
    OTHER_GENERATORS.flatMap((t) => PLACES.map(([where, build]) => [t.name, where, t, build] as const)),
  )('%s --no-route %s: refused, nothing written, no tool run', (_name, _where, target, build) => {
    const dir = target.scratchApp()
    const before = snapshot(dir)
    const run = generate(dir, target.script, build(['--no-route'], target.args))
    expect(run.status).toBe(1)
    expect(run.stderr).toBe(UNKNOWN('--no-route', '--dry'))
    expect(run.stdout).toBe('')
    expect(snapshot(dir)).toEqual(before)
    expect(run.pnpmCalls).toBe('')
  })

  it('new:module still takes --dry, --item and --no-route, in any order', () => {
    const runs = [
      [MOD, '--dry', '--no-route'],
      ['--no-route', '--dry', MOD],
      ['--dry', '--item', 'dry-widget', '--no-route', MOD],
      [MOD, '--no-route', '--item', 'dry-widget', '--dry'],
      ['--dry', '--', MOD],
    ].map((args) => generate(scratch(false), 'new-module.ts', args))
    for (const run of runs) {
      expect(run.status).toBe(0)
      expect(run.stderr).toBe('')
      expect(section(run.stdout, 'Would create').length).toBeGreaterThan(0)
    }
  })
})
