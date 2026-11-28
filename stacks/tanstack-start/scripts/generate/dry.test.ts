// `--dry` on every `pnpm new:*` generator (#710): it prints the plan and writes nothing. The
// scratch-app harness is in harness.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DID_YOU_MEAN,
  generate,
  GENERATORS,
  MOD,
  realChanges,
  scratch,
  section,
  snapshot,
  withScratchApps,
} from './harness.ts'
import { positional } from './lib.ts'

withScratchApps()

describe.each(GENERATORS)('$name --dry', ({ script, args, withModule }) => {
  it('AC-710-1 AC-710-2: writes nothing, runs no tool, and lists what it would create and edit', () => {
    const dry = scratch(withModule)
    const before = snapshot(dry)
    const run = generate(dry, script, [...args, '--dry'])
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(snapshot(dry)).toEqual(before)
    expect(run.pnpmCalls).toBe('')
    expect(section(run.stdout, 'Would create').length).toBeGreaterThan(0)
  })

  it('AC-710-1 AC-710-2: the plan is what a real run then creates and edits', () => {
    const dry = scratch(withModule)
    const planned = generate(dry, script, [...args, '--dry'])
    const real = scratch(withModule)
    const before = snapshot(real)
    const run = generate(real, script, args)
    expect(run.status).toBe(0)
    const { created, edited } = realChanges(before, snapshot(real))
    expect(section(planned.stdout, 'Would create').filter((p) => !p.endsWith('/'))).toEqual(created)
    expect(section(planned.stdout, 'Would edit')).toEqual(edited)
    // Without --dry the tools run, as before.
    expect(run.pnpmCalls).toMatch(/prettier/)
  })
})

describe('--dry refuses with the same message (AC-710-3)', () => {
  type Refusal = {
    why: string
    script: string
    args: string[]
    says: RegExp
    /** Breaks the scratch app before the run, e.g. removes a line a generator edits next to. */
    spoil?: (dir: string) => void
  }
  const rewrite = (dir: string, file: string, change: (text: string) => string) => {
    const path = join(dir, file)
    writeFileSync(path, change(readFileSync(path, 'utf8')))
  }
  const REFUSALS: Refusal[] = [
    { why: 'a bad name', script: 'new-module.ts', args: ['Bad_Name'], says: /must be kebab-case/ },
    {
      why: 'a bad component name',
      script: 'new-component.ts',
      args: [MOD, 'Task Badge'],
      says: /kebab-case/,
    },
    {
      why: 'a missing module',
      script: 'new-section.ts',
      args: ['nope', 'overdue'],
      says: /no module "nope"/,
    },
    {
      why: 'a missing module for a route',
      script: 'new-route.ts',
      args: ['reports', 'nope'],
      says: /no module/,
    },
    { why: 'a module that exists', script: 'new-module.ts', args: [MOD], says: /already exists/ },
    {
      why: 'a component that exists',
      script: 'new-component.ts',
      args: [MOD, 'dry-widget-item'],
      says: /Already there/,
    },
    { why: 'a table that exists', script: 'new-table.ts', args: [MOD, MOD], says: /Already there/ },
    {
      why: 'a route that exists',
      script: 'new-route.ts',
      args: ['index', MOD],
      says: /index\.tsx already exists/,
    },
    {
      why: 'a section with no list query',
      script: 'new-section.ts',
      args: ['bare', 'overdue'],
      says: /no bareQueries\.list/,
    },
    { why: 'no arguments', script: 'new-table.ts', args: [], says: /Usage: pnpm new:table/ },
    {
      why: 'a composition root with no local import to anchor on',
      script: 'new-module.ts',
      args: ['dry-gadgets'],
      says: /Could not update src\/server\/composition\.ts/,
      spoil: (dir) =>
        rewrite(dir, 'src/server/composition.ts', (t) => t.replace(/^import .* from '\.\/.*\n/gm, '')),
    },
    {
      why: 'an e2e helpers file with no ROUTES list',
      script: 'new-route.ts',
      args: ['dry-reports/weekly', MOD],
      says: /Could not update e2e\/helpers\.ts/,
      spoil: (dir) =>
        rewrite(dir, 'e2e/helpers.ts', (t) => t.replace('export const ROUTES = [', 'export const PAGES = [')),
    },
  ]

  const spoiled = (spoil?: (dir: string) => void) => {
    const dir = scratch(true)
    spoil?.(dir)
    return dir
  }

  it.each(REFUSALS)('$why', ({ script, args, says, spoil }) => {
    const plain = generate(spoiled(spoil), script, args)
    expect(plain.status).toBe(1)
    expect(plain.stderr).toMatch(says)
    for (const dryArgs of [
      [...args, '--dry'],
      ['--dry', ...args],
    ]) {
      const dry = spoiled(spoil)
      const before = snapshot(dry)
      const run = generate(dry, script, dryArgs)
      expect(run.status).toBe(1)
      expect(run.stderr).toBe(plain.stderr)
      expect(snapshot(dry)).toEqual(before)
    }
  })
})

describe('--dry before or after the words (AC-710-4)', () => {
  it('works either way round, also next to --item', () => {
    const a = generate(scratch(false), 'new-module.ts', [MOD, '--dry'])
    const b = generate(scratch(false), 'new-module.ts', ['--dry', MOD])
    const c = generate(scratch(false), 'new-module.ts', ['--dry', '--item', 'dry-widget', MOD])
    for (const run of [a, b, c]) expect(section(run.stdout, 'Would create').length).toBeGreaterThan(0)
    expect(b.stdout).toBe(a.stdout)
    expect(c.stdout).toBe(a.stdout)
    const section2 = generate(scratch(true), 'new-section.ts', ['--dry', MOD, 'overdue'])
    expect(section(section2.stdout, 'Would create')).toHaveLength(2)
  })

  it('positional() drops only the word a value flag takes', () => {
    expect(positional(['--dry', 'tasks'])).toEqual(['tasks'])
    expect(positional(['tasks', '--dry'])).toEqual(['tasks'])
    expect(positional(['--no-route', 'tasks'])).toEqual(['tasks'])
    expect(positional(['tasks', '--item', 'task'])).toEqual(['tasks'])
    expect(positional(['--item', 'task', 'tasks'])).toEqual(['tasks'])
    expect(positional(['notes', '--dry', 'task-badge'])).toEqual(['notes', 'task-badge'])
  })
})

describe('a mistyped --dry is refused, never ignored (AC-710-6)', () => {
  type Row = [flag: string, where: string, build: (a: string[]) => string[]]
  const lead = (f: string): Row => [f, 'before the words', (a) => [f, ...a]]
  const trail = (f: string): Row => [f, 'after the words', (a) => [...a, f]]
  // Capitals and near-misses: `--DRY` is a typo of `--dry` too, and none may write.
  const FLAGS = [
    '--dry-run',
    '--dry=yes',
    '--DRY-RUN',
    '--Dry',
    '--DRY',
    '--dryrun',
    '--dry_run',
    '--dry-runs',
  ]
  const ROWS: Row[] = FLAGS.flatMap((f) => [lead(f), trail(f)])

  describe.each(GENERATORS)('$name', ({ script, args, withModule }) => {
    it.each(ROWS)('%s %s: one line, nothing written, no tool run', (flag, _where, build) => {
      const dir = scratch(withModule)
      const before = snapshot(dir)
      const run = generate(dir, script, build(args))
      expect(run.status).toBe(1)
      expect(run.stderr).toBe(DID_YOU_MEAN(flag))
      expect(run.stdout).toBe('')
      expect(snapshot(dir)).toEqual(before)
      expect(run.pnpmCalls).toBe('')
    })
  })

  it('refuses before any other check, and only the --dry look-alikes', () => {
    // A bad name would fail too, but the flag is named first.
    const bad = generate(scratch(false), 'new-module.ts', ['Bad_Name', '--dry-run'])
    expect(bad.stderr).toBe(DID_YOU_MEAN('--dry-run'))
    const value = generate(scratch(false), 'new-module.ts', [MOD, '--dry-run=1'])
    expect(value.stderr).toBe(DID_YOU_MEAN('--dry-run=1'))
    // Other flags keep their meaning: `--dry` plans, `--no-route` is still understood.
    const ok = generate(scratch(false), 'new-module.ts', [MOD, '--dry', '--no-route'])
    expect(ok.status).toBe(0)
    expect(section(ok.stdout, 'Would create').length).toBeGreaterThan(0)
  })
})

describe('pnpm routes:generate --dry plans, never rewrites (AC-710-6)', () => {
  /** A scratch app with one route the tree doesn't list yet, so a real run would rewrite it. */
  const withNewRoute = () => {
    const dir = scratch(false)
    writeFileSync(
      join(dir, 'src/routes/dry-extra.tsx'),
      "import { createFileRoute } from '@tanstack/react-router'\n\nexport const Route = createFileRoute('/dry-extra')({\n  component: () => null,\n})\n",
    )
    return dir
  }

  it('plans the route tree edit and writes nothing', () => {
    const dir = withNewRoute()
    const before = snapshot(dir)
    const run = generate(dir, 'routes.ts', ['--dry'])
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/^Dry run: nothing was written\./)
    expect(section(run.stdout, 'Would edit')).toEqual(['src/routeTree.gen.ts'])
    expect(snapshot(dir)).toEqual(before)
    expect(run.pnpmCalls).toBe('')
  })

  it('without --dry it still regenerates the tree', () => {
    const dir = withNewRoute()
    const before = readFileSync(join(dir, 'src/routeTree.gen.ts'), 'utf8')
    const run = generate(dir, 'routes.ts', [])
    expect(run.status).toBe(0)
    expect(readFileSync(join(dir, 'src/routeTree.gen.ts'), 'utf8')).not.toBe(before)
  })

  it('refuses a mistyped --dry like the other generators', () => {
    const dir = withNewRoute()
    const before = snapshot(dir)
    const run = generate(dir, 'routes.ts', ['--DRY'])
    expect(run.status).toBe(1)
    expect(run.stderr).toBe(DID_YOU_MEAN('--DRY'))
    expect(snapshot(dir)).toEqual(before)
  })
})
