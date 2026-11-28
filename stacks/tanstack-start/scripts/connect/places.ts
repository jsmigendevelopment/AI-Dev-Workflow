// Where a value goes (a local file, a Cloudflare Worker secret, a GitHub environment), and
// whether a name is already set there. Status is read by name only: a file's keys, and the
// name lists from `wrangler secret list` and `gh secret|variable list`.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Scope, VarSpec } from './providers.ts'
import { repositoryPrefix, type SecretsMode } from './secrets-mode.ts'

export type Place =
  | { kind: 'file'; path: string; label: string }
  | { kind: 'wrangler'; env: 'test' | 'production'; label: string }
  | { kind: 'github'; env: string | null; secret: boolean; label: string; prefix?: string }

/**
 * One value the person types, and every place it goes. Production is its own group, except on
 * ci = "local" when one local file feeds every deploy.
 */
export interface Group {
  name: 'local and test' | 'local' | 'test' | 'production' | 'every deploy (test and production)'
  places: Place[]
}

export interface Run {
  (cmd: string, args: string[], input?: string): { status: number; stdout: string; stderr: string }
}

export interface Folders {
  /** The app's folder: .env.example, wrangler.jsonc. */
  app: string
  /** The repository root: .agents, .github, other apps. */
  root: string
}

/** A bare file name lives in the app's folder; a path with a folder is from the repository root. */
export const filePath = (folders: Folders, to: string) =>
  to.includes('/') ? join(folders.root, to) : join(folders.app, to)

/** The name a value is stored under: TEST_ or PRODUCTION_ first for a repository-mode secret. */
export const storedName = (place: Place, name: string) =>
  place.kind === 'github' && place.prefix ? `${place.prefix}${name}` : name

/** GitHub places for one variable: an environment each, or one prefixed repository name each. */
function githubPlaces(spec: VarSpec, has: (s: Scope) => boolean, mode: SecretsMode): Place[] {
  if (mode === 'none') return []
  const kind = spec.secret ? 'secret' : 'variable'
  const envs = (['test', 'preview', 'production'] as const).filter(has)
  if (mode === 'environment')
    return envs.map((env) => ({ kind: 'github', env, secret: spec.secret, label: `GitHub ${env} (${kind})` }))
  // Previews read test's names, so test and preview are one place.
  const prefixes = [...new Set(envs.map(repositoryPrefix))]
  return prefixes.map((prefix) => ({
    kind: 'github',
    env: null,
    prefix,
    secret: spec.secret,
    label: `GitHub repository ${prefix}* (${kind})`,
  }))
}

function placesIn(spec: VarSpec, scopes: Scope[], mode: SecretsMode): Place[] {
  const places: Place[] = []
  const has = (s: Scope) => scopes.includes(s) && spec.scope.includes(s)
  const kind = spec.secret ? 'secret' : 'variable'
  for (const to of spec.to) {
    if (to === 'wrangler') {
      if (has('test')) places.push({ kind: 'wrangler', env: 'test', label: 'Cloudflare test' })
      if (has('production'))
        places.push({ kind: 'wrangler', env: 'production', label: 'Cloudflare production' })
    } else if (to === 'github') {
      places.push(...githubPlaces(spec, has, mode))
    } else if (to === 'github-repo') {
      if (has('test') && mode !== 'none')
        places.push({ kind: 'github', env: null, secret: spec.secret, label: `GitHub repository (${kind})` })
    } else if (has('local')) {
      places.push({ kind: 'file', path: to, label: to })
    }
  }
  return places
}

/**
 * On ci = "local", a value whose production place is only on GitHub reaches production through its
 * local file instead: the deploys run here and load it (Sentry's .env.sentry.local, #444).
 */
const feedsEveryDeploy = (spec: VarSpec, mode: SecretsMode) =>
  mode === 'none' &&
  placesIn(spec, ['production'], 'none').length === 0 &&
  placesIn(spec, ['production'], 'environment').length > 0

function devName(spec: VarSpec, mode: SecretsMode): Group['name'] {
  if (feedsEveryDeploy(spec, mode)) return 'every deploy (test and production)'
  const local = placesIn(spec, ['local'], 'environment').length > 0
  const test = placesIn(spec, ['test', 'preview'], 'environment').length > 0
  return local && test ? 'local and test' : local ? 'local' : 'test'
}

/** The values to ask for: local and test share one unless `split`; production is separate. */
export function groupsFor(spec: VarSpec, mode: SecretsMode = 'environment'): Group[] {
  const groups: Group[] = spec.split
    ? [
        { name: 'local', places: placesIn(spec, ['local'], mode) },
        { name: 'test', places: placesIn(spec, ['test', 'preview'], mode) },
      ]
    : [{ name: devName(spec, mode), places: placesIn(spec, ['local', 'test', 'preview'], mode) }]
  groups.push({ name: 'production', places: placesIn(spec, ['production'], mode) })
  return groups.filter((g) => g.places.length > 0)
}

/** Keys with a non-empty value in a dotenv file. Values are read only to test for emptiness. */
export function keysIn(text: string): Set<string> {
  const keys = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (m && m[2]!.replace(/^(['"])(.*)\1$/, '$2').trim() !== '') keys.add(m[1]!)
  }
  return keys
}

function namesFromJson(stdout: string): Set<string> | undefined {
  const start = stdout.indexOf('[')
  const end = stdout.lastIndexOf(']')
  if (start < 0 || end < start) return undefined
  try {
    const rows = JSON.parse(stdout.slice(start, end + 1)) as Array<{ name?: string }>
    return new Set(rows.map((r) => String(r.name ?? '').toUpperCase()))
  } catch {
    return undefined
  }
}

const placeKey = (p: Place) =>
  p.kind === 'file'
    ? `file:${p.path}`
    : p.kind === 'wrangler'
      ? `wrangler:${p.env}`
      : `gh:${p.secret}:${p.env}`

function listNames(place: Exclude<Place, { kind: 'file' }>, run: Run, repo: string | null) {
  if (place.kind === 'github' && !repo) return undefined
  const r =
    place.kind === 'wrangler'
      ? run('wrangler', ['secret', 'list', '--env', place.env])
      : run('gh', [
          place.secret ? 'secret' : 'variable',
          'list',
          ...(place.env ? ['--env', place.env] : []),
          '--json',
          'name',
          '-R',
          repo ?? '',
        ])
  return r.status === 0 ? namesFromJson(r.stdout) : undefined
}

/** Reads each place's names once. `undefined` means it couldn't be checked. */
export function statusReader(folders: Folders, run: Run, repo: string | null) {
  const cache = new Map<string, Set<string> | undefined>()
  function names(place: Place): Set<string> | undefined {
    if (place.kind === 'file') {
      const path = filePath(folders, place.path)
      return existsSync(path) ? keysIn(readFileSync(path, 'utf8')) : new Set()
    }
    const key = placeKey(place)
    if (!cache.has(key)) cache.set(key, listNames(place, run, repo))
    return cache.get(key)
  }
  return {
    /** true: set, false: missing, undefined: couldn't check. */
    isSet: (name: string, place: Place) => names(place)?.has(storedName(place, name)),
    /** Forget a place's names after writing to it. */
    forget: (place: Place) => cache.delete(placeKey(place)),
  }
}
