// Insights records waiting to land sit as untracked files under docs/insights/. They hold no code, so
// the deploys' clean-checkout check must not count them. Real git here: the fake `git status` answers
// the same whatever it is asked, and how git lists an untracked folder is the point.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { DeployDeps } from './deps'
import { fakes, freshPlace } from './fakes'
import { noChanges, Stop } from './shared'

const folders: string[] = []
afterEach(() => {
  for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true })
})

function checkout() {
  const dir = mkdtempSync(join(tmpdir(), 'pending-records-'))
  folders.push(dir)
  const git = (...args: string[]) =>
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      cwd: dir,
      encoding: 'utf8',
    })
  const put = (path: string, text = '{}\n') => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  git('init', '-q')
  put('docs/insights/2026-11-27/0900-job-1-a.json')
  put('README.md', 'kept\n')
  git('add', '.')
  git('commit', '-q', '-m', 'start')
  const deps: DeployDeps = {
    ...fakes(freshPlace()).deps,
    run: (cmd, args) => {
      const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' })
      return Promise.resolve({ status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr })
    },
  }
  return { deps, put }
}

const NOTHING = 'Nothing was deployed.'

describe('the clean-checkout check and pending insights records', () => {
  it('AC-401-1: WHEN the checkout has pending records under docs/insights/ THEN the clean check passes', async () => {
    const { deps, put } = checkout()
    put('docs/insights/2026-11-28/0301-check-1-b.json') // a new day's folder: git lists the folder
    put('docs/insights/2026-11-27/0905-review-1-c.json') // a new file in a folder git already tracks
    await expect(noChanges(deps, NOTHING)).resolves.toBeUndefined()
  })

  it('AC-401-1: WHEN a pending record sits beside a real change THEN the clean check still fails and names only the change', async () => {
    for (const change of ['src/app.ts', 'docs/notes.md', 'insights-copy/x.json']) {
      const { deps, put } = checkout()
      put('docs/insights/2026-11-28/0301-check-1-b.json')
      put(change)
      const stopped = await noChanges(deps, NOTHING).catch((e: unknown) => e)
      expect(stopped).toBeInstanceOf(Stop)
      const message = (stopped as Stop).message
      expect(message).toContain('uncommitted changes')
      expect(message).toContain(change)
      expect(message).not.toContain('docs/insights/')
    }
  })

  it('AC-401-1: WHEN a record already in git was edited THEN the clean check fails', async () => {
    const { deps, put } = checkout()
    put('docs/insights/2026-11-27/0900-job-1-a.json', '{"edited":true}\n')
    await expect(noChanges(deps, NOTHING)).rejects.toThrow('docs/insights/2026-11-27/0900-job-1-a.json')
  })
})
