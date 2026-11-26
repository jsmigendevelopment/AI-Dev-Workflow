// Writes one value to one place. A value goes only to a git-ignored file (mode 600) or to a
// command's stdin, never into a command's arguments, and never into anything printed.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { filePath, type Folders, type Place, type Run, storedName } from './places.ts'
import { fileProblem } from './repo.ts'

/** A dotenv line that reads back as exactly `value`, or null when no quoting is safe. */
export function envLine(name: string, value: string): string | null {
  if (/^[\w.:/+=@,-]*$/.test(value)) return `${name}=${value}`
  if (!value.includes("'") && !value.includes('\n')) return `${name}='${value}'`
  if (!value.includes('"') && !value.includes('$') && !value.includes('\\')) return `${name}="${value}"`
  return null
}

/** Replaces or adds one line, keeping every other line. Returns false when it can't be quoted. */
export function upsertEnv(path: string, name: string, value: string, platform: NodeJS.Platform): boolean {
  const line = envLine(name, value)
  if (line === null) return false
  const before = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const lines = before.split(/\r?\n/)
  // A multi-line value's continuation lines belong to it, so drop them with it.
  const kept: string[] = []
  let skipping = false
  for (const l of lines) {
    if (skipping) {
      if (l.trimEnd().endsWith('"')) skipping = false
      continue
    }
    const m = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`).exec(l)
    if (m) {
      skipping = m[1]!.startsWith('"') && !/^".*"\s*$/.test(m[1]!)
      continue
    }
    kept.push(l)
  }
  while (kept.length && kept.at(-1) === '') kept.pop()
  kept.push(line, '')
  mkdirSync(dirname(path), { recursive: true })
  // Only the owner may read it, from before the value is in it: `mode` applies only to a new
  // file. Windows has no such mode bits.
  if (platform !== 'win32' && existsSync(path)) chmodSync(path, 0o600)
  writeFileSync(path, kept.join('\n'), { mode: 0o600 })
  return true
}

/** The command that stores a value from stdin, for a place that isn't a file. */
export function storeCommand(
  place: Exclude<Place, { kind: 'file' }>,
  name: string,
  repo: string,
): [string, string[]] {
  if (place.kind === 'wrangler') return ['wrangler', ['secret', 'put', name, '--env', place.env]]
  const where = place.env ? ['--env', place.env] : []
  const set = [place.secret ? 'secret' : 'variable', 'set', storedName(place, name), ...where]
  return ['gh', [...set, '-R', repo]]
}

/** Stores the value. Returns null on success, or a one-line reason with the value scrubbed out. */
export function store(
  place: Place,
  name: string,
  value: string,
  ctx: { folders: Folders; run: Run; platform: NodeJS.Platform; repo: string | null },
): string | null {
  if (place.kind === 'file') {
    const path = filePath(ctx.folders, place.path)
    const problem = fileProblem(ctx.folders.root, path, place.path, ctx.run)
    if (problem) return problem
    return upsertEnv(path, name, value, ctx.platform)
      ? null
      : `this value has quotes and line breaks together, so it can't go in ${place.path} safely.`
  }
  if (place.kind === 'github' && !ctx.repo)
    return "couldn't tell which GitHub repository: the origin remote isn't on github.com."
  const [cmd, args] = storeCommand(place, name, ctx.repo ?? '')
  const r = ctx.run(cmd, args, value)
  if (r.status === 0) return null
  // A tool's own output may quote the value, so none of it is ever printed.
  return `${cmd} exited with code ${r.status}. Run \`${cmd} ${args.join(' ')}\` yourself to see why.`
}
