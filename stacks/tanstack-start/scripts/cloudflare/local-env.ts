// A value from the shell, else from .env.cloudflare.local (git-ignored), for the scripts the
// session runs: setup-cloudflare's tokens and the deploys' protection headers. Never printed.
import { existsSync, readFileSync } from 'node:fs'

export const LOCAL_FILE = '.env.cloudflare.local'

/** `NAME=value` from the shell, else from .env.cloudflare.local; quotes around the value are dropped. */
export function localValue(name: string, env: Record<string, string | undefined> = process.env) {
  if (env[name]) return env[name]
  if (!existsSync(LOCAL_FILE)) return undefined
  const line = readFileSync(LOCAL_FILE, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`))
  return (
    line
      ?.slice(name.length + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2') || undefined
  )
}
