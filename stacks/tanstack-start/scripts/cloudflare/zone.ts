// The free zone security settings: Always Use HTTPS, TLS 1.2+, AI training disallowed, a
// scanner-path WAF rule, Bot Fight Mode on request.
import type { Deps, Log, Options } from './deps.ts'
import type { EnvName, EnvResources } from './wrangler-config.ts'

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

export const ZONE_TOKEN_HELP = [
  'The zone settings need a second, separate token (never give it to CI):',
  '  Zone → Zone: Read, Zone → Zone Settings: Edit, Zone → Zone WAF: Edit, Zone → Bot Management: Edit,',
  '  Zone Resources: only the app zone, with an expiry.',
  'Put it in .env.cloudflare.local (git-ignored) as CLOUDFLARE_ZONE_TOKEN=..., then run this again.',
]

function wafSet(result: unknown): ZoneState['waf'] {
  const set = result as
    { id?: string; rules?: { id: string; ref?: string; expression: string }[] } | undefined
  return set?.id ? { id: set.id, rules: set.rules ?? [] } : null
}

/** Step 6: the free zone settings, when there is a zone and a zone token. */
export async function zone(deps: Deps, options: Options, log: Log, resources: Record<EnvName, EnvResources>) {
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
