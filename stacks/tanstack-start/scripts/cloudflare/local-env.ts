// A value from the shell, else from .env.cloudflare.local (git-ignored), for the scripts the
// session runs: setup-cloudflare's tokens and the deploys' protection headers. Never printed.
import { existsSync, readFileSync } from 'node:fs'

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
