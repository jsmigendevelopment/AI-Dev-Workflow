import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { dockerArgs } from './docker'

const command = ['exec', 'playwright', 'test', '--project=visual-desktop']
const pair = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]!] : []))
/** After the tests: what root wrote goes to /work's owner inside the container, unless that is root. */
const GIVE_BACK =
  'owner=$(stat -c %u:%g /work); if [ -n "$owner" ] && [ "$owner" != 0:0 ]; then ' +
  'find /work \\( -path \'*/node_modules\' -o -path /work/.git \\) -prune -o -user 0 -exec chown -h "$owner" {} +; fi'

/**
 * Runs the container's script with fakes on PATH: the tests exit 3, `stat` says /work belongs to
 * `owner`, and `find` only records its arguments. Returns the exit status and what `find` got.
 */
function runScript(script: string, owner: string) {
  const bin = mkdtempSync(join(tmpdir(), 'docker-script-'))
  try {
    const fake = (name: string, body: string) => {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`)
      chmodSync(join(bin, name), 0o755)
    }
    fake('npm', 'exit 0')
    fake('pnpm', 'case "$*" in *playwright*) exit 3;; esac; exit 0')
    fake('stat', `echo ${owner}`)
    fake('find', `printf '%s ' "$@" >> ${join(bin, 'found')}`)
    const ran = spawnSync('sh', ['-c', script], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    const found = join(bin, 'found')
    return { status: ran.status, found: existsSync(found) ? readFileSync(found, 'utf8') : '' }
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
}

describe('pnpm test:visual --docker', () => {
  it('on its own, mounts the app, installs from its lockfile and runs there', () => {
    const args = dockerArgs({ root: '/app', app: '', packages: [''], gitFolder: true, command })
    expect(pair(args, '-v')).toEqual(['/app:/work', '/work/node_modules', '/work/.git'])
    expect(pair(args, '-w')).toEqual(['/work'])
    expect(args.at(-1)).toBe(
      "npm install -g pnpm@12.21.0 && pnpm --dir /work install --frozen-lockfile && pnpm 'exec' 'playwright' 'test' '--project=visual-desktop'" +
        `; status=$?; ${GIVE_BACK}; exit $status`,
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
    const script = dockerArgs({ root: '/app', app: '', packages: [''], gitFolder: true, command }).at(-1)!
    expect(script).toMatch(
      /^npm install -g pnpm@12\.21\.0 && .* && pnpm 'exec' 'playwright' 'test' '--project=visual-desktop'; status=\$\?; /,
    )
    expect(script).toMatch(/; exit \$status$/)
    const { status, found } = runScript(script, '1000:1000')
    expect(status).toBe(3)
    expect(found).toBe(
      '/work ( -path */node_modules -o -path /work/.git ) -prune -o -user 0 -exec chown -h 1000:1000 {} + ',
    )
  })

  it('AC-150-6: WHEN /work belongs to root inside the container (rootless Docker or Podman, or a root host user) THEN nothing is handed over, and the tests’ exit status is kept', () => {
    const script = dockerArgs({ root: '/app', app: '', packages: [''], gitFolder: true, command }).at(-1)!
    const { status, found } = runScript(script, '0:0')
    expect(status).toBe(3)
    expect(found).toBe('')
  })
})
