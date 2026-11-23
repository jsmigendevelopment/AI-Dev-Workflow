// Pins where values may go: the one GitHub repository named by `origin`, and files that stay
// inside the repository root (after following symlinks) and that git positively ignores.
import { existsSync, realpathSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'

import type { Run } from './places.ts'

const GITHUB =
  /^(?:https:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/

/** `owner/repo` from the `origin` remote, or null when origin isn't a GitHub repository. */
export function githubRepo(root: string, run: Run): string | null {
  const r = run('git', ['-C', root, 'remote', 'get-url', 'origin'])
  if (r.status !== 0) return null
  const m = GITHUB.exec(r.stdout.trim())
  return m ? `${m[1]}/${m[2]}` : null
}

/** The path with every existing part's symlinks followed. */
function realish(path: string): string {
  let existing = resolve(path)
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing)
  return resolve(realpathSync(existing), relative(existing, resolve(path)))
}

/** Why a file can't be written, or null when it is inside the root and git ignores it. */
export function fileProblem(root: string, path: string, shown: string, run: Run): string | null {
  const realRoot = realpathSync(root)
  const real = realish(path)
  if (real !== realRoot && !real.startsWith(realRoot + sep))
    return `${shown} resolves outside the repository, so nothing was written.`
  const r = run('git', ['-C', realRoot, 'check-ignore', '-q', '--', real])
  if (r.status === 0) return null
  if (r.status === 1) return `${shown} isn't git-ignored, so nothing was written. Add it to .gitignore first.`
  return `git couldn't confirm that ${shown} is git-ignored (is this a git repository?), so nothing was written.`
}
