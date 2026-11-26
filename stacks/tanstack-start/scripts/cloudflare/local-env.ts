// A value from the shell, else from .env.cloudflare.local (git-ignored), for the scripts the
// session runs: setup-cloudflare's tokens and the deploys' protection headers. Never printed.
// setup-cloudflare also saves the values it makes there (owner-only, mode 600), as connect does.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { fileProblem } from '../connect/repo.ts'
import { upsertEnv } from '../connect/store.ts'

export const LOCAL_FILE = '.env.cloudflare.local'

/** Every `NAME=value` line in .env.cloudflare.local, in order; quotes around a value are dropped. */
export function localEntries(): [string, string][] {
  if (!existsSync(LOCAL_FILE)) return []
  return readFileSync(LOCAL_FILE, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      const at = line.indexOf('=')
      if (at < 1) return []
      const value = line
        .slice(at + 1)
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2')
      return value ? [[line.slice(0, at), value] as [string, string]] : []
    })
}

/** `NAME=value` from the shell, else from .env.cloudflare.local; quotes around the value are dropped. */
export function localValue(name: string, env: Record<string, string | undefined> = process.env) {
  if (env[name]) return env[name]
  return localEntries().find(([key]) => key === name)?.[1]
}

/** Why `file` can't hold a secret (outside the repository, or not git-ignored), or null. */
export function localFileProblem(file = LOCAL_FILE, root = process.cwd()): string | null {
  return fileProblem(root, file, file, (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8' })
    return { status: r.status ?? 2, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  })
}

/** Saves `NAME=value` in `file`, replacing an older line, owner-only (mode 600). Never prints. */
export const saveLocalValue = (name: string, value: string, file = LOCAL_FILE) =>
  upsertEnv(file, name, value, process.platform)
