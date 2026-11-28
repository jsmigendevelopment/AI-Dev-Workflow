// Reads the kit's provider walkthroughs (.agents/skills/secrets/providers/*.md): the small
// ```json connect``` block each one carries, and the numbered steps of its walkthrough section.
// The steps stay prose in the markdown; this only shortens them for the terminal.

export const SCOPES = ['local', 'test', 'preview', 'production'] as const
export type Scope = (typeof SCOPES)[number]

/** An optional check of a value's shape. The value itself is never printed. */
export interface Shape {
  prefix?: string[]
  min?: number
  max?: number
  /** Documented test values (always-pass keys) refused in production, by prefix. */
  notInProduction?: string[]
}

/** One variable a provider fills, and where it goes. */
export interface VarSpec {
  secret: boolean
  scope: Scope[]
  /** "wrangler", "github", "github-repo", or a file (`.env.local`, or `apps/mobile/.env` from the repo root). */
  to: string[]
  shape?: Shape
  /** Local and test take different values (Turnstile's local test keys). */
  split?: boolean
  /** The walkthrough heading and page for this variable, when not the provider's own. */
  steps?: string
  url?: string
}

export interface Step {
  text: string
  /** Lines from the step's code blocks: the text to copy, or a command to run. */
  copy: string[]
  unverified: boolean
}

/** One walkthrough section, shortened. */
export interface Section {
  heading: string
  url: string
  steps: Step[]
  done?: string
}

export interface Provider {
  id: string
  title: string
  order: number
  lastChecked?: string
  vars: Record<string, VarSpec>
  /** The section each variable is set up in. */
  sections: Record<string, Section>
}

const BLOCK = /^```json connect\s*\n([\s\S]*?)\n```/m
const NAME = /^[A-Z][A-Z0-9_]*$/
// https only, and nothing a terminal or a shell could read as more than a URL.
const HTTPS = /^https:\/\/[\w.~:/?#@!$&'()*+,;=%-]+$/
// Commands that store a value: this script does that itself, so it doesn't print them.
const STORES_VALUE = /secret set|secret put|variable set|push-secrets/

function fail(id: string, message: string): never {
  throw new Error(`providers/${id}.md: the connect block ${message}`)
}

function checkVar(id: string, name: string, spec: VarSpec) {
  if (!NAME.test(name)) fail(id, `has a bad variable name: ${name}`)
  if (typeof spec.secret !== 'boolean') fail(id, `needs "secret": true or false for ${name}`)
  if (!Array.isArray(spec.scope) || spec.scope.some((s) => !SCOPES.includes(s)))
    fail(id, `has a bad scope for ${name} (use ${SCOPES.join(', ')})`)
  if (!Array.isArray(spec.to) || spec.to.length === 0) fail(id, `needs "to" for ${name}`)
  if (spec.url !== undefined && !HTTPS.test(spec.url)) fail(id, `needs an https "url" for ${name}`)
  for (const to of spec.to)
    if (!['wrangler', 'github', 'github-repo'].includes(to) && !safeFile(to))
      fail(id, `has a bad destination for ${name}: ${to}`)
}

/** A relative .env path that stays inside the repository: no "..", no absolute path. */
export const safeFile = (to: string) =>
  /^[\w.-]+(\/[\w.-]+)*$/.test(to) && /(^|\/)\.env[\w.-]*$/.test(to) && !to.split('/').includes('..')

/** Text for a terminal: no markdown emphasis, links as "text (url)", no review markers. */
export function plain(line: string): string {
  return (
    line
      .replace(/`?\[[VU]\]`?/g, '')
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/`/g, '')
      .replace(/\(\s*,?\s*/g, '(')
      // A space before end-of-sentence punctuation goes; "into .env.local" keeps its space.
      .replace(/\s+([.,:;])(?=\s|$)/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

function sectionOf(lines: string[], heading: string | undefined) {
  const start = lines.findIndex((l) => (heading ? l.startsWith(heading) : /^## (Walkthrough|1\.)/.test(l)))
  if (start < 0) return { title: '', body: [] as string[] }
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  return { title: lines[start]!, body: lines.slice(start + 1, end < 0 ? undefined : end) }
}

/** The walkthrough's top-level numbered steps, with their code blocks, and its "When it worked". */
export function readSteps(markdown: string, heading?: string) {
  const { title, body } = sectionOf(markdown.split(/\r?\n/), heading)
  const steps: Step[] = []
  let done: string | undefined
  let fence: { keep: boolean } | null = null
  for (const line of body) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      fence = fence ? null : { keep: steps.length > 0 }
      continue
    }
    if (fence) {
      if (fence.keep && trimmed && !STORES_VALUE.test(trimmed)) steps.at(-1)!.copy.push(trimmed)
      continue
    }
    const step = /^(\d+)\.\s+(.*)$/.exec(line)
    if (step) steps.push({ text: plain(step[2]!), copy: [], unverified: line.includes('[U]') })
    else if (line.startsWith('When it worked:')) done = plain(line.slice('When it worked:'.length))
  }
  return { title: title.replace(/^##\s*(\d+\.\s*)?/, ''), steps, done }
}

interface Block {
  title?: string
  order?: number
  url?: string
  steps?: string
  vars?: Record<string, VarSpec>
}

function readBlock(
  id: string,
  json: string,
): Block & { title: string; url: string; vars: Record<string, VarSpec> } {
  let block: Block
  try {
    block = JSON.parse(json) as Block
  } catch {
    fail(id, 'is not valid JSON')
  }
  if (!block.title || !block.url || !HTTPS.test(block.url)) fail(id, 'needs a "title" and an https "url"')
  if (!block.vars || Object.keys(block.vars).length === 0) fail(id, 'needs "vars"')
  for (const [name, spec] of Object.entries(block.vars)) checkVar(id, name, spec)
  return { ...block, title: block.title, url: block.url, vars: block.vars }
}

/** One provider file, or null when it has no connect block. Throws on a malformed block. */
export function parseProvider(id: string, markdown: string): Provider | null {
  const match = BLOCK.exec(markdown)
  if (!match) return null
  const block = readBlock(id, match[1]!)
  const sections: Record<string, Section> = {}
  for (const [name, spec] of Object.entries(block.vars)) {
    const wanted = spec.steps ?? block.steps
    const { title, steps, done } = readSteps(markdown, wanted)
    if (steps.length === 0)
      fail(id, `points ${name} at a walkthrough with no numbered steps (${wanted ?? '## 1.'})`)
    sections[name] = { heading: title, url: spec.url ?? block.url, steps, done }
  }
  return {
    id,
    title: block.title,
    order: block.order ?? 50,
    lastChecked: /^Last checked: (\d{4}-\d{2}-\d{2})/m.exec(markdown)?.[1],
    vars: block.vars,
    sections,
  }
}

/** Every provider with a connect block, in walkthrough order. */
export function parseProviders(files: Array<{ id: string; markdown: string }>): Provider[] {
  return files
    .map((f) => parseProvider(f.id, f.markdown))
    .filter((p): p is Provider => p !== null)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/**
 * The prefixes a group may take: live keys only in production, test keys never there. Only the group
 * named `production` counts as production. No value asked "for every deploy" has a prefix shape today
 * (a test pins that); one that does needs that group counted as production here.
 */
export function prefixesFor(shape: Shape, group: string): string[] | undefined {
  const production = group === 'production'
  return shape.prefix?.filter((p) => (production ? !p.includes('_test_') : !p.includes('_live_')))
}

function pemProblem(name: string, value: string, prefixes: string[]): string | null {
  const label = prefixes.map((p) => /^-----BEGIN ([A-Z0-9 ]+)-----$/.exec(p)?.[1]).find(Boolean)
  if (!label) return value.includes('\n') ? `${name} should be one line.` : null
  const end = `-----END ${label}-----`
  if (value.split('-----BEGIN ').length !== 2 || !value.trimEnd().endsWith(end))
    return `${name} should be one block from -----BEGIN ${label}----- to ${end}.`
  return null
}

function prefixProblem(name: string, value: string, shape: Shape, prefixes: string[], group: string) {
  if (prefixes.some((p) => value.startsWith(p))) return null
  const other = shape.prefix?.find((p) => value.startsWith(p))
  if (other && group === 'production') return `${name} for production must be a live key, not ${other}.`
  if (other) return `${name} for ${group} must be a test key: ${other} keys go only in production.`
  return `${name} should start with ${prefixes.join(' or ')}.`
}

/** The reason a value has the wrong shape for its group, naming the rule but never the value. */
export function shapeProblem(name: string, value: string, shape: Shape | undefined, group: string) {
  const prefixes = shape ? prefixesFor(shape, group) : undefined
  const problem =
    (shape && prefixes && prefixProblem(name, value, shape, prefixes, group)) ||
    pemProblem(name, value, prefixes ?? [])
  if (problem || !shape) return problem
  const testValue = group === 'production' && shape.notInProduction?.find((p) => value.startsWith(p))
  if (testValue) return `${name} for production can't be a documented test value (${testValue}…).`
  if (shape.min !== undefined && value.length < shape.min)
    return `${name} should be at least ${shape.min} characters (that was ${value.length}).`
  if (shape.max !== undefined && value.length > shape.max)
    return `${name} should be at most ${shape.max} characters (that was ${value.length}).`
  return null
}

// Prefixes of secret keys every provider uses, beyond the ones in the connect blocks.
const SECRET_PREFIXES = ['sk_', 'rk_', 'whsec_', 're_', 'cfut_', 'sntrys_', 'ghp_', 'github_pat_']
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every prefix a secret variable in these providers starts with. */
export const secretPrefixes = (providers: Provider[]) => [
  ...new Set([
    ...SECRET_PREFIXES,
    ...providers.flatMap((p) =>
      Object.values(p.vars).flatMap((v) => (v.secret ? (v.shape?.prefix ?? []) : [])),
    ),
  ]),
]

/**
 * Whether a value meant for a public variable looks like a secret: a known secret prefix, a PEM
 * block, or a long random token (over 32 characters, no spaces, dots or colons; a GUID is fine).
 * A value matching the variable's own prefix (pk_..., a PEM public key) is trusted.
 */
export function looksSecret(value: string, own: Shape | undefined, known: string[]): boolean {
  if (own?.prefix?.some((p) => value.startsWith(p))) return false
  if (known.some((p) => value.startsWith(p)) || value.includes('-----BEGIN ')) return true
  return /^[A-Za-z0-9_+/=-]{33,}$/.test(value) && !GUID.test(value)
}
