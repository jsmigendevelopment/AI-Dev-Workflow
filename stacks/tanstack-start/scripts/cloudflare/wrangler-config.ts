// wrangler.jsonc and wrangler's output: read and edited as text, keeping comments and layout.
// ---------------------------------------------------------------- wrangler.jsonc

export const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'
export const ENVIRONMENTS = ['test', 'production'] as const
export type EnvName = (typeof ENVIRONMENTS)[number]

/** JSONC to JSON: drops comments and trailing commas, leaves strings alone. */
export function stripJsonc(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1
      if (i === 0) break
    } else out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

export interface EnvResources {
  worker: string
  databases: { name: string; id: string }[]
  buckets: string[]
  queues: string[]
  hosts: string[]
  /** The environment's own `vars` (not inherited): LAUNCHED, SITE_PROTECTION and any add-on's. */
  vars: Record<string, string>
}

interface RawEnv {
  name?: string
  vars?: Record<string, string>
  d1_databases?: { database_name: string; database_id?: string }[]
  r2_buckets?: { bucket_name: string }[]
  queues?: { producers?: { queue: string }[]; consumers?: { queue: string; dead_letter_queue?: string }[] }
  routes?: (string | { pattern: string })[]
}

/** What each deployed environment needs on Cloudflare, read from wrangler.jsonc. */
export function readResources(jsonc: string): Record<EnvName, EnvResources> {
  const config = JSON.parse(stripJsonc(jsonc)) as RawEnv & { env?: Record<string, RawEnv> }
  const pick = (name: EnvName): EnvResources => {
    const env = config.env?.[name]
    if (!env) throw new Error(`wrangler.jsonc has no env.${name}. Add it first (see the stack skill).`)
    const queues = [
      ...(env.queues?.producers ?? []).map((p) => p.queue),
      ...(env.queues?.consumers ?? []).flatMap((c) => [c.queue, c.dead_letter_queue ?? '']),
    ].filter(Boolean)
    return {
      worker: env.name ?? `${config.name}-${name}`,
      databases: (env.d1_databases ?? []).map((d) => ({ name: d.database_name, id: d.database_id ?? '' })),
      buckets: (env.r2_buckets ?? []).map((b) => b.bucket_name),
      queues: [...new Set(queues)],
      hosts: (env.routes ?? []).map((r) =>
        (typeof r === 'string' ? r : r.pattern).split('/')[0]!.replace(/^\*\.?/, ''),
      ),
      vars: env.vars ?? {},
    }
  }
  return { test: pick('test'), production: pick('production') }
}

/** Writes one database's id into wrangler.jsonc, keeping comments and layout. */
export function setDatabaseId(jsonc: string, databaseName: string, id: string): string {
  const name = `"database_name"\\s*:\\s*"${databaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
  const after = new RegExp(`(${name}[^{}]*?"database_id"\\s*:\\s*")[^"]*(")`)
  const before = new RegExp(`("database_id"\\s*:\\s*")[^"]*("[^{}]*?${name})`)
  if (after.test(jsonc)) return jsonc.replace(after, `$1${id}$2`)
  if (before.test(jsonc)) return jsonc.replace(before, `$1${id}$2`)
  throw new Error(`No database_id next to database_name "${databaseName}" in wrangler.jsonc.`)
}

/** The index just past the `}` that closes the `{` at `open`, skipping strings and comments. */
function blockEnd(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]!
    if (c === '"') {
      i++
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1
    } else if (c === '/' && text[i + 1] === '/') while (i < text.length && text[i] !== '\n') i++
    else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i + 2) + 1
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i + 1
  }
  throw new Error('wrangler.jsonc has an unclosed {.')
}

/** Sets one var in `env.<name>.vars` of wrangler.jsonc, keeping comments and layout. */
export function setEnvVar(jsonc: string, env: EnvName, name: string, value: string): string {
  const envKey = new RegExp(`"env"\\s*:\\s*\\{`).exec(jsonc)
  const key = envKey && new RegExp(`"${env}"\\s*:\\s*\\{`, 'g')
  if (key) key.lastIndex = envKey.index
  const found = key?.exec(jsonc)
  if (!found) throw new Error(`wrangler.jsonc has no env.${env}.`)
  const open = found.index + found[0].length - 1
  const block = jsonc.slice(open, blockEnd(jsonc, open))
  const vars = /"vars"\s*:\s*\{[^{}]*\}/.exec(block)
  if (!vars)
    throw new Error(`wrangler.jsonc env.${env} has no "vars". Add "vars": { "${name}": "${value}" }.`)
  const entry = new RegExp(`("${name}"\\s*:\\s*")[^"]*(")`)
  const next = entry.test(vars[0])
    ? vars[0].replace(entry, `$1${value}$2`)
    : vars[0].replace(/\{\s*/, (b) => `${b}"${name}": "${value}", `)
  const start = open + vars.index
  return jsonc.slice(0, start) + next + jsonc.slice(start + vars[0].length)
}

// ---------------------------------------------------------------- wrangler output

/** The first JSON value in a command's output (wrangler can print a banner first). */
export function firstJson<T>(text: string): T | undefined {
  const start = text.search(/[[{]/)
  if (start < 0) return undefined
  const close = text[start] === '[' ? ']' : '}'
  for (let end = text.lastIndexOf(close); end > start; end = text.lastIndexOf(close, end - 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T
    } catch {
      // a shorter slice, in case a log line follows the JSON
    }
  }
  return undefined
}

export interface Account {
  id: string
  name: string
}

export function parseAccounts(whoamiJson: string): Account[] {
  const data = firstJson<{ accounts?: { id: string; name: string }[] }>(whoamiJson)
  return (data?.accounts ?? []).map(({ id, name }) => ({ id, name }))
}

export function parseD1List(json: string): { name: string; uuid: string }[] {
  return (firstJson<{ name: string; uuid: string }[]>(json) ?? []).map(({ name, uuid }) => ({ name, uuid }))
}

/** `r2 bucket list` and `queues list` print text or a table: look for the name as a whole word. */
export function listsName(output: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[\\s│|:])${escaped}($|[\\s│|])`, 'm').test(output)
}
