// Cloudflare Access through the API: the logins, a smoke-test service token and one Access application,
// for the test Worker (and its previews) or for production (all of it, or some paths).
// API shapes: cloudflare/api-schemas openapi.json (2026-11-22): access_identity-providers,
// access_destinations, access_email_rule, access_domain_rule, access_github_organization_rule.
import { OPEN_PATHS } from '../../src/lib/open-paths.ts'
import type { Ci } from './ci-mode.ts'
import type { ApiResult, Deps, Log } from './deps.ts'
import { LOCAL_FILE } from './local-env.ts'
import { type LoginName, LOGINS, setupStep, shortLabel } from './logins.ts'

/** Who may sign in. Rules are OR'ed: any one match lets the person in. */
export interface Who {
  emails: string[]
  /** Email domains, `company.com` (no @). */
  domains: string[]
  /** A GitHub org: needs the GitHub login. */
  githubOrg?: string | undefined
}

export interface Worker {
  id: string
  name: string
}

/** What the Access application covers. */
export type Target =
  | { kind: 'test'; worker: Worker }
  | { kind: 'production'; worker: Worker }
  | { kind: 'paths'; worker: Worker; uris: string[] }

interface Policy {
  name?: string
  decision: string
  include: Record<string, unknown>[]
}

interface AccessApp {
  id: string
  name?: string
  aud?: string
  allowed_idps?: string[]
  destinations?: { type: string; worker_id?: string; uri?: string; overrides?: unknown[] }[]
  policies?: Policy[]
}

export const results = <T>(r: ApiResult) =>
  r.status < 300 && r.body?.success !== false ? ((r.body?.result as T) ?? null) : null

const overrides = () =>
  OPEN_PATHS.length ? { overrides: OPEN_PATHS.map((p) => ({ behavior: 'public', path_pattern: p })) } : {}

export function appName(target: Target): string {
  const n = target.worker.name
  return target.kind === 'test'
    ? `${n} (test and previews)`
    : target.kind === 'production'
      ? `${n} (production)`
      : `${n} (production paths)`
}

function destinations(target: Target) {
  if (target.kind === 'paths') return target.uris.map((uri) => ({ type: 'public', uri }))
  return [{ type: 'worker', worker_id: target.worker.id, ...overrides() }]
}

/** The allow rules for `who`. The GitHub org rule needs the GitHub login's id. */
export function whoRules(who: Who, githubIdp?: string): Record<string, unknown>[] {
  return [
    ...who.emails.map((email) => ({ email: { email } })),
    ...who.domains.map((domain) => ({ email_domain: { domain } })),
    ...(who.githubOrg && githubIdp
      ? [{ 'github-organization': { name: who.githubOrg, identity_provider_id: githubIdp } }]
      : []),
  ]
}

/** The Access application: what it covers, which logins it offers, the smoke tests' service token and who may sign in. */
export function accessAppBody(
  target: Target,
  idps: string[],
  tokenId: string | undefined,
  who: Who,
  githubIdp?: string,
) {
  return {
    type: 'self_hosted',
    name: appName(target),
    destinations: destinations(target),
    session_duration: '24h',
    ...(idps.length ? { allowed_idps: idps, auto_redirect_to_identity: idps.length === 1 } : {}),
    policies: [
      // Service Auth: the smoke tests send CF-Access-Client-Id and CF-Access-Client-Secret, no login page.
      ...(tokenId
        ? [
            {
              name: 'CI service token',
              decision: 'non_identity',
              include: [{ service_token: { token_id: tokenId } }],
            },
          ]
        : []),
      { name: 'Who may sign in', decision: 'allow', include: whoRules(who, githubIdp) },
    ],
  }
}

/** What matters when comparing a live app with the one wanted (ids and order aside). */
function shape(app: Pick<AccessApp, 'allowed_idps' | 'destinations' | 'policies'>): string {
  return JSON.stringify({
    idps: [...(app.allowed_idps ?? [])].sort(),
    destinations: (app.destinations ?? []).map((d) => [d.type, d.worker_id, d.uri, d.overrides ?? []]),
    policies: (app.policies ?? []).map((p) => [p.decision, p.include]),
  })
}

export interface AccessContext {
  deps: Deps
  log: Log
  dryRun: boolean
  /** `/accounts/<id>` */
  a: string
  /** `<team>.cloudflareaccess.com` */
  team: string
  github: GithubWrites
}

/** `ci = "actions"` only: the GitHub environments get the secrets too, when `gh` is signed in. */
export interface GithubWrites {
  actions: boolean
  gh: boolean
}

/** Logins whose client id and secret are not set yet: prints the person's setup steps for each. */
export function missingLogins(ctx: AccessContext, logins: LoginName[]): LoginName[] {
  const missing = logins.filter((n) => LOGINS[n].needs.some((v) => !ctx.deps.secret(v)))
  for (const name of missing) {
    ctx.log('')
    for (const line of setupStep(name, ctx.team)) ctx.log(line)
  }
  if (missing.length)
    ctx.log(
      '\nThen run this again. Missing: ' +
        missing.flatMap((n) => LOGINS[n].needs.filter((v) => !ctx.deps.secret(v))).join(', '),
    )
  return missing
}

/** Each login as an Access identity provider, created when missing. Returns type → id. */
export async function ensureLogins(ctx: AccessContext, logins: LoginName[]): Promise<Map<string, string>> {
  const { deps, log, a } = ctx
  const listed =
    results<{ id: string; type: string }[]>(await deps.api('GET', `${a}/access/identity_providers`)) ?? []
  const ids = new Map<string, string>()
  for (const name of logins) {
    const login = LOGINS[name]
    const found = listed.find((i) => i.type === login.type)
    if (found) {
      log(`exists  ${shortLabel(name)} login`)
      ids.set(login.type, found.id)
      continue
    }
    log(`${ctx.dryRun ? 'would create' : 'creating'} the ${shortLabel(name)} login`)
    if (ctx.dryRun) continue
    const get = (v: string) => deps.secret(v) ?? ''
    const made = results<{ id: string }>(
      await deps.api('POST', `${a}/access/identity_providers`, {
        name: shortLabel(name),
        type: login.type,
        config: login.config(get),
      }),
    )
    if (made) ids.set(login.type, made.id)
    else log(`  could not create the ${shortLabel(name)} login. Check its client id and secret.`)
  }
  return ids
}

/** Sets one GitHub environment secret per env, the value on stdin, never printed. */
export async function ghSecret(deps: Deps, log: Log, name: string, value: string, envs: string[]) {
  for (const env of envs) {
    const set = await deps.run('gh', ['secret', 'set', name, '--env', env], value)
    log(
      set.status === 0
        ? `  set ${name} in the GitHub environment ${env}`
        : `  failed to set ${name} in ${env}: ${set.stderr.trim().split('\n')[0]}`,
    )
  }
}

/** Whether GitHub gets the values too: only on `ci = "actions"`, with the GitHub CLI signed in. */
export async function githubWrites(deps: Deps, ci: Ci | undefined): Promise<GithubWrites> {
  const actions = ci === 'actions'
  return { actions, gh: actions && (await deps.run('gh', ['auth', 'status'])).status === 0 }
}

/** The prefix the deploys read a site's values under: TEST_ (test and previews) or PRODUCTION_. */
export const localPrefix = (envs: string[]) => (envs.includes('production') ? 'PRODUCTION_' : 'TEST_')

/**
 * Saves each value in .env.cloudflare.local as `<prefix><name>`. Returns null, or why one couldn't
 * be saved: a name and an error code at most, never a value. Names only in the log.
 */
export function saveForDeploys(deps: Deps, log: Log, prefix: string, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const problem = saveOne(deps, prefix + name, value)
    if (problem) return problem
  }
  const names = Object.keys(values).map((name) => prefix + name)
  log(`  saved ${names.join(' and ')} in ${LOCAL_FILE} (git-ignored, owner-only), where the deploys read it`)
  return null
}

function saveOne(deps: Deps, name: string, value: string): string | null {
  try {
    return deps.saveLocal(name, value) ? null : `${name} could not be saved in ${LOCAL_FILE}`
  } catch (error) {
    // The error's message can name the file but never the value; its code says enough.
    return `${LOCAL_FILE} could not be written (${(error as NodeJS.ErrnoException).code ?? 'an error'})`
  }
}

/** The Access application, created or brought in line. Returns its audience tag (AUD), if known. */
export async function ensureApp(
  ctx: AccessContext,
  target: Target,
  body: ReturnType<typeof accessAppBody>,
): Promise<{ ok: boolean; aud?: string | undefined }> {
  const { deps, log, a } = ctx
  const apps = results<AccessApp[]>(await deps.api('GET', `${a}/access/apps`)) ?? []
  const app = apps.find(
    (x) =>
      x.name === body.name ||
      (target.kind !== 'paths' &&
        x.destinations?.some((d) => d.type === 'worker' && d.worker_id === target.worker.id)),
  )
  if (app && shape(app) === shape(body)) {
    log(`exists  Access application "${app.name ?? app.id}" (Zero Trust → Access → Applications)`)
    return { ok: true, aud: app.aud }
  }
  const verb = app ? 'updat' : 'creat'
  log(
    `${ctx.dryRun ? `would ${verb}e` : `${verb}ing`} the Access application "${body.name}": ${body.destinations.length} destination(s), logins and who may sign in as given`,
  )
  if (app) log('  This replaces its logins and policies with the ones above (edits made in Zero Trust go).')
  if (ctx.dryRun) return { ok: true, aud: app?.aud }
  const made = results<{ id: string; aud?: string }>(
    app
      ? await deps.api('PUT', `${a}/access/apps/${app.id}`, body)
      : await deps.api('POST', `${a}/access/apps`, body),
  )
  if (!made) {
    log(
      '  refused. Set it up in the dashboard: Workers & Pages → the Worker → Access → Protect this Worker behind Access.',
    )
    return { ok: false }
  }
  return { ok: true, aud: made.aud ?? app?.aud }
}
