// A value from the shell, else from .env.cloudflare.local (git-ignored), for the scripts the
// session runs: setup-cloudflare's tokens and the deploys' protection headers. Never printed.
// setup-cloudflare also saves the values it makes there (owner-only, mode 600), as connect does.
import { spawnSync } from 'node:child_process'
import { accessSync, chmodSync, closeSync, constants, existsSync, openSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

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

/**
 * Why `file` can't hold a secret (outside the repository, not git-ignored, or not writable), or
 * null. `create` makes the file owner-only (mode 600), or opens it for writing; without it, this
 * only reads (a dry run).
 */
export function localFileProblem(file = LOCAL_FILE, root = process.cwd(), create = false): string | null {
  const problem = fileProblem(root, file, file, (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8' })
    return { status: r.status ?? 2, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  })
  if (problem) return problem
  try {
    if (!create) accessSync(existsSync(file) ? file : dirname(resolve(file)), constants.W_OK)
    else {
      closeSync(openSync(file, 'a', 0o600))
      // Only the owner may read it. Windows has no such mode bits.
      if (process.platform !== 'win32') chmodSync(file, 0o600)
    }
    return null
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'an error'
    return `${file} can't be written (${code}), so nothing was written. Make it writable by you first.`
  }
}

/** Whether the deploys can read a value for `name`: from the shell, else .env.cloudflare.local. */
export const hasLocalValue = (name: string) => Boolean(localValue(name))

/** Saves `NAME=value` in `file`, replacing an older line, owner-only (mode 600). Never prints. */
export const saveLocalValue = (name: string, value: string, file = LOCAL_FILE) =>
  upsertEnv(file, name, value, process.platform)
