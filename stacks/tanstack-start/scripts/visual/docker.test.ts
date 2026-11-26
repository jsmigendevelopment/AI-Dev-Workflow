import { describe, expect, it } from 'vitest'

import { dockerArgs } from './docker'

const command = ['exec', 'playwright', 'test', '--project=visual-desktop']
const pair = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]!] : []))

describe('pnpm test:visual --docker', () => {
  it('on its own, mounts the app, installs from its lockfile and runs there', () => {
    const args = dockerArgs({ root: '/app', app: '', packages: [''], gitFolder: true, command })
    expect(pair(args, '-v')).toEqual(['/app:/work', '/work/node_modules', '/work/.git'])
    expect(pair(args, '-w')).toEqual(['/work'])
    expect(args.at(-1)).toBe(
      "npm install -g pnpm@12.21.0 && pnpm --dir /work install --frozen-lockfile && pnpm 'exec' 'playwright' 'test' '--project=visual-desktop'",
    )
  })

  it('in the monorepo, mounts the workspace root (where the lockfile is) and runs from apps/web', () => {
    const packages = ['', 'apps/mobile', 'apps/web', 'packages/api-client', 'packages/contracts']
    const args = dockerArgs({ root: '/repo', app: 'apps/web', packages, gitFolder: true, command })
    expect(pair(args, '-v')).toEqual([
      '/repo:/work',
      '/work/node_modules',
      '/work/apps/web/node_modules',
      '/work/apps/mobile/node_modules',
      '/work/packages/api-client/node_modules',
      '/work/packages/contracts/node_modules',
      '/work/.git',
    ])
    expect(pair(args, '-w')).toEqual(['/work/apps/web'])
    expect(args.at(-1)).toContain('pnpm --dir /work install --frozen-lockfile && pnpm ')
    expect(args.join(' ')).not.toContain('/repo/apps/web:')
  })

  it('in a git worktree, where .git is a file, leaves it alone instead of covering it', () => {
    const args = dockerArgs({ root: '/gate', app: '', packages: [''], gitFolder: false, command })
    expect(pair(args, '-v')).toEqual(['/gate:/work', '/work/node_modules'])
  })

  it('AC-150-6: WHEN the host user isn’t root THEN the files the run writes are handed back to them, and the tests’ exit status is kept', () => {
    const args = dockerArgs({
      root: '/app',
      app: '',
      packages: [''],
      gitFolder: true,
      command,
      owner: '1000:1000',
    })
    const script = args.at(-1)!
    expect(script).toMatch(
      /^npm install -g pnpm@12\.21\.0 && .* && pnpm 'exec' 'playwright' 'test' '--project=visual-desktop'; status=\$\?; /,
    )
    expect(script).toContain(
      "find /work \\( -path '*/node_modules' -o -path /work/.git \\) -prune -o -user 0 -exec chown -h 1000:1000 {} +",
    )
    expect(script).toMatch(/; exit \$status$/)
  })
})
