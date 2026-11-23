// The logic behind scripts/setup-cloudflare.mjs, with every side effect injected (`Deps`), so the
// planning is unit-tested with fakes (setup.test.ts). Reads run in a dry run too; writes never do.
// It never prints a token or secret value, except the test site's password, once, when it makes one.
import { OPEN_PATHS } from '../../src/lib/open-paths.ts'

export interface CommandResult {
  status: number
  stdout: string
  stderr: string
}

export interface ApiResult {
  status: number
  body: { success?: boolean; result?: unknown; errors?: { message: string }[] } | null
}

export interface Deps {
  /** Runs `wrangler <args>` (through pnpm exec in the real entry), with optional stdin. */
  wrangler(args: string[], input?: string): Promise<CommandResult>
  /** Runs any other command (node, gh). */
  run(cmd: string, args: string[], input?: string): Promise<CommandResult>
  /**
   * The Cloudflare API. Paths under `/zones` use the zone token; paths under `/accounts` use the
   * Access token (Cloudflare Access only).
   */
  api(method: string, path: string, body?: unknown): Promise<ApiResult>
  /** A new random secret: 32 URL-safe characters (the password gate's SITE_PASSWORD). */
  randomSecret(): string
  readText(path: string): string
  writeText(path: string, text: string): void
  exists(path: string): boolean
  remove(path: string): void
  log(line: string): void
  env: Record<string, string | undefined>
}

export interface Options {
  dryRun: boolean
  /** The zone (apex domain) for the security settings; default: the production routes' host. */
  zone?: string | undefined
  account?: string | undefined
  /** Bot Fight Mode on the zone: recommended once the production custom domain exists. */
  botFightMode?: boolean
  /** Cloudflare's managed robots.txt: off by default (the app writes its own). */
  managedRobots?: boolean
  skipSecrets?: boolean
  /** How the test Worker and its previews are protected: the person's choice (`PROTECTION_CHOICES`). */
  protect?: Protection | undefined
  /** Cloudflare Access only: the person's email for the one-time PIN. Asked at setup, never written. */
  accessEmail?: string | undefined
  /** The password gate only: make a new SITE_PASSWORD even if one is set. */
  newPassword?: boolean
}

export const PROTECTIONS = ['access', 'password', 'none'] as const
export type Protection = (typeof PROTECTIONS)[number]

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

// ---------------------------------------------------------------- zone security settings

/** Mirrors SCANNER_PATH in src/lib/request-limits.ts (Free zones have no regex in rules). */
export const SCANNER_EXTENSIONS = [
  '.php',
  '.php5',
  '.php7',
  '.asp',
  '.aspx',
  '.jsp',
  '.cgi',
  '.ini',
  '.sql',
  '.bak',
  '.old',
]
export const SCANNER_PREFIXES = [
  '/wp-',
  '/.env',
  '/.git',
  '/.svn',
  '/.aws',
  '/.ssh',
  '/.ds_store',
  '/xmlrpc',
  '/phpmyadmin',
  '/cgi-bin',
  '/vendor/phpunit',
]
export const SCANNER_RULE_REF = 'kit-scanner-paths'

/** Block scanner paths at the edge (not even counted as a request), on the app's hosts only. */
export function scannerRuleExpression(hosts: string[]): string {
  const path = 'lower(http.request.uri.path)'
  const terms = [
    ...SCANNER_EXTENSIONS.map((e) => `ends_with(${path}, "${e}")`),
    ...SCANNER_PREFIXES.map((p) => `starts_with(${path}, "${p}")`),
  ]
  const scope = hosts.length ? ` and http.host in {${hosts.map((h) => `"${h}"`).join(' ')}}` : ''
  return `(${terms.join(' or ')})${scope}`
}

export const BOT_FIGHT_MODE_WHY =
  'it challenges known bad bots on the custom domain (the whole zone; test and previews are on workers.dev, outside it). The page CSP allows its same-origin /cdn-cgi/ script, and the production smoke test runs on workers.dev, so it never meets a challenge. It cannot be skipped per path, and it strips ETags. Ask the person, then pass --bot-fight-mode'

export interface ZoneChange {
  what: string
  why: string
  apply?: { method: string; path: string; body: unknown }
}

export interface ZoneState {
  alwaysUseHttps: string | undefined
  minTls: string | undefined
  bots: Record<string, unknown> | undefined
  waf: { id: string; rules: { id: string; ref?: string; expression: string }[] } | null
}

/** The free settings, as a list of changes from the zone's current state. Empty: nothing to do. */
export function zoneChanges(
  zoneId: string,
  hosts: string[],
  state: ZoneState,
  options: Options,
): ZoneChange[] {
  const z = `/zones/${zoneId}`
  const changes: ZoneChange[] = []
  if (state.alwaysUseHttps !== 'on')
    changes.push({
      what: 'Always Use HTTPS: on',
      why: 'every http:// request is redirected to https:// at the edge, before the Worker runs',
      apply: { method: 'PATCH', path: `${z}/settings/always_use_https`, body: { value: 'on' } },
    })
  if (!['1.2', '1.3'].includes(state.minTls ?? ''))
    changes.push({
      what: 'Minimum TLS version: 1.2',
      why: 'TLS 1.0 and 1.1 are broken and no current browser needs them',
      apply: { method: 'PATCH', path: `${z}/settings/min_tls_version`, body: { value: '1.2' } },
    })

  // AI crawlers: training disallowed, search and agents allowed. Never "block" for training: since
  // 2026-09 that also stops Googlebot, Bingbot and Applebot (they are mixed-use crawlers).
  const bots = state.bots ?? {}
  const wantBots: Record<string, unknown> = {}
  if (bots.ai_training !== 'disallow') wantBots.ai_training = 'disallow'
  if (options.botFightMode && bots.fight_mode !== true) wantBots.fight_mode = true
  if (options.managedRobots && bots.is_robots_txt_managed !== true) wantBots.is_robots_txt_managed = true
  if (Object.keys(wantBots).length)
    changes.push({
      what: `Bots: ${Object.entries(wantBots)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ')}`,
      why:
        'AI Crawl Control: training crawlers are told no (Disallow), search and AI search stay welcome' +
        (wantBots.fight_mode
          ? '; Bot Fight Mode challenges known bad bots on every host of the zone (it adds a script the page CSP allows)'
          : '') +
        (wantBots.is_robots_txt_managed ? "; Cloudflare's managed robots.txt is added to the app's own" : ''),
      apply: { method: 'PUT', path: `${z}/bot_management`, body: wantBots },
    })
  if (!options.botFightMode && bots.fight_mode !== true)
    changes.push({
      what: 'Bot Fight Mode: off, recommended on',
      why: BOT_FIGHT_MODE_WHY,
    })
  if (!options.managedRobots && bots.is_robots_txt_managed !== true)
    changes.push({
      what: 'Managed robots.txt: left off',
      why: "the app's own robots.txt already disallows AI training (src/lib/seo-files.ts); one source of truth. Pass --managed-robots to add Cloudflare's",
    })

  const expression = scannerRuleExpression(hosts)
  const rule = {
    ref: SCANNER_RULE_REF,
    description: 'Block vulnerability-scanner paths (ai-dev-workflow kit)',
    expression,
    action: 'block',
    enabled: true,
  }
  const why = 'requests for .php, /.env, /.git and friends never reach the Worker or count toward its quota'
  const existing = state.waf?.rules.find((r) => r.ref === SCANNER_RULE_REF)
  if (!state.waf)
    changes.push({
      what: 'WAF custom rule: block scanner paths (new rule set)',
      why,
      apply: {
        method: 'PUT',
        path: `${z}/rulesets/phases/http_request_firewall_custom/entrypoint`,
        body: { rules: [rule] },
      },
    })
  else if (!existing)
    changes.push({
      what: 'WAF custom rule: block scanner paths',
      why,
      apply: { method: 'POST', path: `${z}/rulesets/${state.waf.id}/rules`, body: rule },
    })
  else if (existing.expression !== expression)
    changes.push({
      what: 'WAF custom rule: block scanner paths (updated)',
      why,
      apply: { method: 'PATCH', path: `${z}/rulesets/${state.waf.id}/rules/${existing.id}`, body: rule },
    })
  return changes
}

// ---------------------------------------------------------------- the run

export const DEPLOY_TOKEN_HELP = [
  'Create the GitHub Actions token: Cloudflare dashboard → My Profile → API Tokens → Create Token,',
  'start from the "Edit Cloudflare Workers" template, then:',
  '  - Account → D1 → Edit (migrations and Time Travel bookmarks)',
  '  - Account → Queues → Edit (only with the jobs add-on)',
  '  - Account Resources: this account only. Zone Resources: only the app zone (or none without a domain).',
  '  - Set an expiry (for example 1 year) and put it in your calendar.',
  'Then store it, typing the value into the prompt, never into chat:',
  '  gh secret set CLOUDFLARE_API_TOKEN --env test',
  '  gh secret set CLOUDFLARE_API_TOKEN --env production',
  '  gh secret set CLOUDFLARE_API_TOKEN --env preview',
]

export const ZONE_TOKEN_HELP = [
  'The zone settings need a second, separate token (never give it to CI):',
  '  Zone → Zone: Read, Zone → Zone Settings: Edit, Zone → Zone WAF: Edit, Zone → Bot Management: Edit,',
  '  Zone Resources: only the app zone, with an expiry.',
  'Put it in .env.cloudflare.local (git-ignored) as CLOUDFLARE_ZONE_TOKEN=..., then run this again.',
]

type Log = (line: string) => void

function wafSet(result: unknown): ZoneState['waf'] {
  const set = result as
    { id?: string; rules?: { id: string; ref?: string; expression: string }[] } | undefined
  return set?.id ? { id: set.id, rules: set.rules ?? [] } : null
}

async function wranglerOk(deps: Deps, args: string[]): Promise<string> {
  const result = await deps.wrangler(args)
  if (result.status !== 0)
    throw new Error(
      `wrangler ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim().split('\n').at(-1)}`,
    )
  return result.stdout
}

/** Step 1: signed in, and which account. */
async function account(deps: Deps, options: Options, log: Log): Promise<Account | null> {
  const who = await deps.wrangler(['whoami', '--json'])
  if (who.status !== 0) {
    log('Not signed in to Cloudflare. Ask the person to run `pnpm exec wrangler login`, then run this again.')
    return null
  }
  const accounts = parseAccounts(who.stdout)
  const wanted = options.account ?? deps.env.CLOUDFLARE_ACCOUNT_ID
  const chosen = wanted
    ? accounts.find((a) => a.id === wanted)
    : accounts.length === 1
      ? accounts[0]
      : undefined
  if (!chosen) {
    log(wanted ? `Account ${wanted} is not one this login can use.` : 'This login has several accounts:')
    for (const a of accounts) log(`  ${a.id}  ${a.name}`)
    log('Ask the person which one, then run again with --account <id>.')
    return null
  }
  log(`Signed in. Account: ${chosen.name}`)
  return chosen
}

/** Step 2: the D1 databases, created when missing; their ids written into wrangler.jsonc. */
async function databases(deps: Deps, options: Options, log: Log, resources: Record<EnvName, EnvResources>) {
  let existing = parseD1List(await wranglerOk(deps, ['d1', 'list', '--json']))
  let jsonc = deps.readText('wrangler.jsonc')
  for (const env of ENVIRONMENTS)
    for (const db of resources[env].databases) {
      let found = existing.find((d) => d.name === db.name)
      if (!found) {
        log(`${options.dryRun ? 'would create' : 'creating'} D1 database ${db.name} (${env})`)
        if (options.dryRun) continue
        await wranglerOk(deps, ['d1', 'create', db.name])
        existing = parseD1List(await wranglerOk(deps, ['d1', 'list', '--json']))
        found = existing.find((d) => d.name === db.name)
        if (!found) throw new Error(`Created ${db.name} but it is not listed yet. Run this again.`)
      } else log(`exists  D1 database ${db.name} (${env})`)
      if (found.uuid !== db.id) {
        log(`${options.dryRun ? 'would write' : 'writing'} its id into wrangler.jsonc env.${env}`)
        jsonc = setDatabaseId(jsonc, db.name, found.uuid)
      }
    }
  if (!options.dryRun && jsonc !== deps.readText('wrangler.jsonc')) deps.writeText('wrangler.jsonc', jsonc)
}

/** Step 3: R2 buckets and queues that enabled add-ons declared in wrangler.jsonc. */
async function addonResources(
  deps: Deps,
  options: Options,
  log: Log,
  resources: Record<EnvName, EnvResources>,
) {
  const buckets = [...new Set(ENVIRONMENTS.flatMap((e) => resources[e].buckets))]
  const queues = [...new Set(ENVIRONMENTS.flatMap((e) => resources[e].queues))]
  if (buckets.length) {
    const listed = await wranglerOk(deps, ['r2', 'bucket', 'list'])
    for (const name of buckets) {
      if (listsName(listed, name)) log(`exists  R2 bucket ${name}`)
      else {
        log(`${options.dryRun ? 'would create' : 'creating'} R2 bucket ${name}`)
        if (!options.dryRun) await wranglerOk(deps, ['r2', 'bucket', 'create', name])
      }
    }
  }
  if (queues.length) {
    const listed = await wranglerOk(deps, ['queues', 'list'])
    for (const name of queues) {
      if (listsName(listed, name)) log(`exists  queue ${name}`)
      else {
        log(`${options.dryRun ? 'would create' : 'creating'} queue ${name}`)
        if (!options.dryRun) await wranglerOk(deps, ['queues', 'create', name])
      }
    }
  }
  if (!buckets.length && !queues.length) log('No R2 buckets or queues declared (no add-on needs them).')
}

/** Step 4: the account id and the deploy token, for GitHub Actions. */
async function github(deps: Deps, options: Options, log: Log, chosen: Account) {
  log(`CLOUDFLARE_ACCOUNT_ID = ${chosen.id}   (not a secret, but stored as one by the workflows)`)
  const gh = await deps.run('gh', ['auth', 'status'])
  if (gh.status !== 0)
    log('GitHub CLI not signed in: set CLOUDFLARE_ACCOUNT_ID by hand in each environment below.')
  else
    for (const env of ['test', 'production', 'preview']) {
      log(
        `${options.dryRun ? 'would set' : 'setting'} CLOUDFLARE_ACCOUNT_ID in the GitHub environment ${env}`,
      )
      if (options.dryRun) continue
      if (env === 'preview') {
        // Created here because setup-github makes only test and production. No branch rule, no reviewers.
        const repo = (
          await deps.run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
        ).stdout.trim()
        await deps.run('gh', ['api', '-X', 'PUT', `repos/${repo}/environments/preview`])
      }
      const set = await deps.run('gh', ['secret', 'set', 'CLOUDFLARE_ACCOUNT_ID', '--env', env], chosen.id)
      if (set.status !== 0) log(`  failed: ${set.stderr.trim().split('\n')[0]}`)
    }
  for (const line of DEPLOY_TOKEN_HELP) log(line)
}

/** Step 5: the app's own secrets, through the kit's push-secrets script. */
async function secrets(deps: Deps, options: Options, log: Log) {
  const script = '.agents/skills/secrets/scripts/push-secrets.mjs'
  if (options.skipSecrets) return log('Skipped the app secrets (--skip-secrets).')
  if (!deps.exists(script)) return log(`No ${script} here: wire the app secrets with the secrets skill.`)
  // A build leaves a redirect to its flattened config; `wrangler secret put --env` would then
  // follow it and could name the wrong Worker. The next build writes it again.
  if (deps.exists('.wrangler/deploy/config.json')) {
    log(
      `${options.dryRun ? 'would remove' : 'removing'} .wrangler/deploy/config.json (a build artefact) so secrets reach the right Worker`,
    )
    if (!options.dryRun) deps.remove('.wrangler/deploy/config.json')
  }
  const result = await deps.run('node', [script, '--wrangler', ...(options.dryRun ? ['--dry-run'] : [])])
  for (const line of result.stdout.trim().split('\n').filter(Boolean)) log(`  ${line}`)
  if (result.status !== 0) log('  push-secrets reported failures (names above).')
}

/** Step 6: the free zone settings, when there is a zone and a zone token. */
async function zone(deps: Deps, options: Options, log: Log, resources: Record<EnvName, EnvResources>) {
  const hosts = resources.production.hosts
  const candidates = options.zone
    ? [options.zone]
    : hosts.flatMap((h) =>
        h
          .split('.')
          .map((_, i, all) => all.slice(i).join('.'))
          .slice(0, -1),
      )
  if (!candidates.length) {
    log(
      'No domain configured (no production routes, no --zone): zone settings skipped. workers.dev is outside any zone.',
    )
    log('  Bot Fight Mode: needs the production custom domain first; recommended once it exists.')
    return
  }
  if (!deps.env.CLOUDFLARE_ZONE_TOKEN) {
    log(`Zone settings for ${candidates[0]} need a zone token.`)
    for (const line of ZONE_TOKEN_HELP) log(line)
    log(
      options.botFightMode
        ? '  Bot Fight Mode: will be turned on once the zone token is there (--bot-fight-mode).'
        : `  Bot Fight Mode: recommended for ${hosts.join(', ') || candidates[0]}: ${BOT_FIGHT_MODE_WHY}.`,
    )
    return
  }
  let zoneId: string | undefined
  let zoneName = ''
  for (const name of candidates) {
    const found = await deps.api('GET', `/zones?name=${encodeURIComponent(name)}`)
    const first = (found.body?.result as { id: string; name: string }[] | undefined)?.[0]
    if (first) {
      zoneId = first.id
      zoneName = first.name
      break
    }
  }
  if (!zoneId)
    return log(`No zone named ${candidates.join(' or ')} on this token. Check the token's Zone Resources.`)
  const z = `/zones/${zoneId}`
  const value = async (path: string) =>
    ((await deps.api('GET', path)).body?.result as { value?: string } | undefined)?.value
  const wafRead = await deps.api('GET', `${z}/rulesets/phases/http_request_firewall_custom/entrypoint`)
  const state: ZoneState = {
    alwaysUseHttps: await value(`${z}/settings/always_use_https`),
    minTls: await value(`${z}/settings/min_tls_version`),
    bots: (await deps.api('GET', `${z}/bot_management`)).body?.result as Record<string, unknown> | undefined,
    waf: wafRead.status === 404 ? null : wafSet(wafRead.body?.result),
  }
  if (!hosts.length) log('  No production routes: the scanner rule would apply to every host in the zone.')
  const changes = zoneChanges(zoneId, hosts, state, options)
  log(`Zone ${zoneName}:`)
  if (!changes.some((c) => c.apply))
    log('  already set: Always Use HTTPS, TLS 1.2+, AI training disallowed, scanner-path rule')
  for (const change of changes) {
    if (!change.apply) {
      log(`  ${change.what}: ${change.why}`)
      continue
    }
    log(`  ${options.dryRun ? 'would set' : 'setting'} ${change.what}: ${change.why}`)
    if (options.dryRun) continue
    const done = await deps.api(change.apply.method, change.apply.path, change.apply.body)
    if (done.status >= 300 || done.body?.success === false) {
      const reason = done.body?.errors?.[0]?.message ?? `HTTP ${done.status}`
      log(`    not applied (${reason}). Set it in the dashboard instead.`)
    }
  }
  if (!options.dryRun && changes.some((c) => c.what.startsWith('Bots'))) {
    // The AI policy fields were reorganised in 2026: read back rather than trust the write.
    const after = (await deps.api('GET', `${z}/bot_management`)).body?.result as
      Record<string, unknown> | undefined
    if (after?.ai_training !== 'disallow')
      log(
        '    AI training policy did not read back as disallow: set Security → Bots → AI crawler policies → Training: Disallow.',
      )
  }
}

// ---------------------------------------------------------------- test and preview protection

export const PROTECTION_CHOICES = [
  'a) Cloudflare Access (recommended): a Cloudflare sign-in page in front of the test Worker, its',
  '   workers.dev URL and every preview URL, static files included. The person gets a one-time PIN',
  '   by email; CI gets a service token. Free for small teams (Zero Trust Free plan).',
  '   Run: --protect access --access-email <their email>',
  'b) A password page in the app (test and previews only): one random password, shown once. Covers',
  '   pages, server functions and /api/v1, not the static files. Run: --protect password',
  'c) None: anyone with the URL can open the test site (it stays out of search). Run: --protect none',
]

export const ACCESS_TOKEN_HELP = [
  'Cloudflare Access needs an account token (never give it to CI): My Profile → API Tokens → Create',
  'Custom Token with Account → Access: Apps and Policies → Edit, Access: Service Tokens → Edit,',
  'Access: Organizations, Identity Providers, and Groups → Edit, Workers Scripts → Read;',
  'Account Resources: this account only; an expiry. Put it in .env.cloudflare.local (git-ignored)',
  'as CLOUDFLARE_ACCESS_TOKEN=..., then run this again.',
]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface AccessApp {
  id: string
  name?: string
  destinations?: { type: string; worker_id?: string; overrides?: { path_pattern: string }[] }[]
}

/** The Access application for the test Worker: its workers.dev URL, routes and previews. */
export function accessAppBody(
  worker: { id: string; name: string },
  idpId: string | undefined,
  tokenId: string | undefined,
  email: string,
) {
  return {
    type: 'self_hosted',
    name: `${worker.name} (test and previews)`,
    destinations: [
      {
        type: 'worker',
        worker_id: worker.id,
        ...(OPEN_PATHS.length
          ? { overrides: OPEN_PATHS.map((p) => ({ behavior: 'public', path_pattern: p })) }
          : {}),
      },
    ],
    session_duration: '24h',
    ...(idpId ? { allowed_idps: [idpId], auto_redirect_to_identity: true } : {}),
    policies: [
      // Service Auth: CI sends CF-Access-Client-Id and CF-Access-Client-Secret, no login page.
      ...(tokenId
        ? [
            {
              name: 'CI service token',
              decision: 'non_identity',
              include: [{ service_token: { token_id: tokenId } }],
            },
          ]
        : []),
      { name: 'The owner', decision: 'allow', include: [{ email: { email } }] },
    ],
  }
}

const results = <T>(r: ApiResult) =>
  r.status < 300 && r.body?.success !== false ? ((r.body?.result as T) ?? null) : null

async function ghSecret(deps: Deps, log: Log, name: string, value: string, envs: string[]) {
  for (const env of envs) {
    const set = await deps.run('gh', ['secret', 'set', name, '--env', env], value)
    log(
      set.status === 0
        ? `  set ${name} in the GitHub environment ${env}`
        : `  failed to set ${name} in ${env}: ${set.stderr.trim().split('\n')[0]}`,
    )
  }
}

async function protectWithPassword(deps: Deps, options: Options, log: Log, gh: boolean): Promise<boolean> {
  const listed = await deps.wrangler(['secret', 'list', '--env', 'test', '--format', 'json'])
  const names =
    listed.status === 0 ? (firstJson<{ name: string }[]>(listed.stdout) ?? []).map((s) => s.name) : []
  if (names.includes('SITE_PASSWORD') && !options.newPassword) {
    log('exists  SITE_PASSWORD on the test Worker (pass --new-password to replace it)')
    return true
  }
  if (options.dryRun) {
    log(
      'would make a random SITE_PASSWORD (never the repo name), set it on the test Worker and in the GitHub environments test and preview, and show it once',
    )
    return true
  }
  const password = deps.randomSecret()
  const put = await deps.wrangler(['secret', 'put', 'SITE_PASSWORD', '--env', 'test'], password)
  if (put.status !== 0) {
    log(
      `  could not set SITE_PASSWORD on the test Worker: ${(put.stderr || put.stdout).trim().split('\n').at(-1)}`,
    )
    return false
  }
  log('  set SITE_PASSWORD on the test Worker (previews use it too)')
  if (gh) await ghSecret(deps, log, 'SITE_PASSWORD', password, ['test', 'preview'])
  else
    log('  GitHub CLI not signed in: set SITE_PASSWORD in the GitHub environments test and preview by hand.')
  log(`  The test site's password, shown once. Give it to the person: ${password}`)
  return true
}

async function protectWithAccess(
  deps: Deps,
  options: Options,
  log: Log,
  chosen: Account,
  worker: string,
  gh: boolean,
): Promise<boolean> {
  if (!deps.env.CLOUDFLARE_ACCESS_TOKEN) {
    for (const line of ACCESS_TOKEN_HELP) log(line)
    return false
  }
  if (!options.accessEmail || !EMAIL.test(options.accessEmail)) {
    log(
      'Ask the person which email should get the one-time PIN, then run again with --access-email <it>. It is never written to a file.',
    )
    return false
  }
  const a = `/accounts/${chosen.id}`
  const verb = (what: string) => log(`${options.dryRun ? 'would create' : 'creating'} ${what}`)
  if (!results(await deps.api('GET', `${a}/access/organizations`))) {
    log(
      'Zero Trust is not set up on this account yet. The person opens Zero Trust in the Cloudflare dashboard once and picks the Free plan (it can ask for a payment method: that is their call), then run this again.',
    )
    return false
  }
  const workers =
    results<{ id: string; name: string }[]>(await deps.api('GET', `${a}/workers/workers?per_page=100`)) ?? []
  const found = workers.find((w) => w.name === worker)
  if (!found) {
    log(
      `The test Worker ${worker} is not deployed yet, so Access has nothing to attach to. Let deploy-test run once, then run this again right after.`,
    )
    return false
  }

  const idps =
    results<{ id: string; type: string }[]>(await deps.api('GET', `${a}/access/identity_providers`)) ?? []
  let idp = idps.find((i) => i.type === 'onetimepin')?.id
  if (idp) log('exists  One-time PIN login')
  else {
    verb('the One-time PIN login (Cloudflare emails a code; no other identity provider needed)')
    if (!options.dryRun)
      idp = results<{ id: string }>(
        await deps.api('POST', `${a}/access/identity_providers`, {
          name: 'One-time PIN',
          type: 'onetimepin',
          config: {},
        }),
      )?.id
  }

  const tokenName = `${worker} CI`
  const tokens =
    results<{ id: string; name: string }[]>(await deps.api('GET', `${a}/access/service_tokens`)) ?? []
  let tokenId = tokens.find((t) => t.name === tokenName)?.id
  if (tokenId)
    log(
      `exists  service token "${tokenName}" (its secret is shown only once; if GitHub lacks it, refresh the token in Zero Trust → Service credentials and set CF_ACCESS_CLIENT_SECRET again)`,
    )
  else {
    verb(
      `service token "${tokenName}" (1 year) and put it in the GitHub environments test and preview as CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET`,
    )
    if (!options.dryRun) {
      const token = results<{ id: string; client_id: string; client_secret: string }>(
        await deps.api('POST', `${a}/access/service_tokens`, { name: tokenName, duration: '8760h' }),
      )
      if (!token) {
        log('  could not create the service token. Check the token permissions above.')
        return false
      }
      tokenId = token.id
      if (gh) {
        await ghSecret(deps, log, 'CF_ACCESS_CLIENT_ID', token.client_id, ['test', 'preview'])
        await ghSecret(deps, log, 'CF_ACCESS_CLIENT_SECRET', token.client_secret, ['test', 'preview'])
      } else
        log(
          '  GitHub CLI not signed in: the service token secret cannot be shown again. Delete the token, sign in to gh, run this again.',
        )
    }
  }

  const apps = results<AccessApp[]>(await deps.api('GET', `${a}/access/apps`)) ?? []
  const app = apps.find((x) => x.destinations?.some((d) => d.type === 'worker' && d.worker_id === found.id))
  if (app) {
    log(
      `exists  Access application "${app.name ?? app.id}" on the test Worker (people who may sign in: Zero Trust → Access → Applications)`,
    )
    const open =
      app.destinations?.find((d) => d.type === 'worker')?.overrides?.map((o) => o.path_pattern) ?? []
    if (open.join() !== OPEN_PATHS.join())
      log(
        `  its public paths (${open.join(', ') || 'none'}) differ from OPEN_PATHS (${OPEN_PATHS.join(', ') || 'none'}): edit them in Zero Trust.`,
      )
  } else {
    verb(
      `the Access application for ${worker}: workers.dev, previews and routes; the email you gave signs in with a one-time PIN, CI with the service token`,
    )
    if (!options.dryRun) {
      const made = results<{ id: string }>(
        await deps.api('POST', `${a}/access/apps`, accessAppBody(found, idp, tokenId, options.accessEmail)),
      )
      if (!made) {
        log(
          '  not created. Set it up in the dashboard: Workers & Pages → the test Worker → Access → Protect this Worker behind Access, All traffic.',
        )
        return false
      }
    }
  }
  return true
}

/** Step 6: how the test Worker and its previews are protected. Records the choice in wrangler.jsonc. */
async function protection(
  deps: Deps,
  options: Options,
  log: Log,
  resources: Record<EnvName, EnvResources>,
  chosen: Account,
) {
  const current = resources.test.vars.SITE_PROTECTION ?? 'none'
  if (!options.protect) {
    log(`Now: ${current}. Ask the person which they want (the test URL and every preview URL):`)
    for (const line of PROTECTION_CHOICES) log(`  ${line}`)
    return
  }
  const gh = (await deps.run('gh', ['auth', 'status'])).status === 0
  const done =
    options.protect === 'none'
      ? (log('No protection: the test and preview URLs are open to anyone who has them (noindex).'), true)
      : options.protect === 'password'
        ? await protectWithPassword(deps, options, log, gh)
        : await protectWithAccess(deps, options, log, chosen, resources.test.worker, gh)
  if (!done) return log(`  SITE_PROTECTION stays "${current}".`)
  if (current === options.protect)
    return log(`exists  SITE_PROTECTION "${current}" in wrangler.jsonc env.test`)
  log(
    `${options.dryRun ? 'would write' : 'writing'} SITE_PROTECTION "${options.protect}" into wrangler.jsonc env.test (commit it; it applies on the next test deploy)`,
  )
  if (current === 'access')
    log('  The Access application stays: delete it in Zero Trust if the person no longer wants it.')
  if (!options.dryRun)
    deps.writeText(
      'wrangler.jsonc',
      setEnvVar(deps.readText('wrangler.jsonc'), 'test', 'SITE_PROTECTION', options.protect),
    )
}

/** The whole setup, in order. Returns the exit code. */
export async function setupCloudflare(options: Options, deps: Deps): Promise<number> {
  const log = deps.log
  log(options.dryRun ? 'Dry run: reads only, nothing is created or changed.\n' : 'Setting up Cloudflare.\n')
  const resources = readResources(deps.readText('wrangler.jsonc'))
  const chosen = await account(deps, options, log)
  if (!chosen) return 2
  deps.env.CLOUDFLARE_ACCOUNT_ID = chosen.id
  try {
    log('\n1. D1 databases')
    await databases(deps, options, log, resources)
    log('\n2. R2 buckets and queues')
    await addonResources(deps, options, log, resources)
    log('\n3. GitHub Actions')
    await github(deps, options, log, chosen)
    log('\n4. App secrets')
    await secrets(deps, options, log)
    log('\n5. Zone security settings')
    await zone(deps, options, log, resources)
    log('\n6. Protecting the test and preview URLs')
    await protection(deps, options, log, resources, chosen)
  } catch (error) {
    log(`\nStopped: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  log(
    options.dryRun
      ? '\nDry run done. Show this to the person and ask before running it for real.'
      : '\nDone. Run it again any time: it skips what exists.',
  )
  return 0
}
