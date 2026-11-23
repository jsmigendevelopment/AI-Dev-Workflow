import { describe, expect, it } from 'vitest'

import { SCANNER_PATH } from '@/lib/request-limits'

import { blankZone, freshWorld, LIVE_CONFIG, PACK_CONFIG, run, withAddons } from './fakes'
import { PLACEHOLDER_ID, readResources, setDatabaseId, stripJsonc } from './wrangler-config'
import { SCANNER_EXTENSIONS, SCANNER_PREFIXES, SCANNER_RULE_REF, scannerRuleExpression } from './zone'

describe('wrangler.jsonc', () => {
  it('reads this project’s own config: both deployed environments, each with its own Worker', () => {
    const r = readResources(LIVE_CONFIG)
    expect(r.test.worker).not.toBe(r.production.worker)
    for (const env of [r.test, r.production])
      for (const db of env.databases) expect(db.name, 'one database per environment').not.toBe('app')
  })

  it('reads each environment’s Worker and database from the pack’s config', () => {
    const r = readResources(PACK_CONFIG)
    // Only what the pack itself declares: add-ons may add buckets, queues and routes.
    expect(r.test).toMatchObject({
      worker: 'app-test',
      databases: [{ name: 'app-test', id: PLACEHOLDER_ID }],
    })
    expect(r.production.worker).toBe('app-production')
    expect(r.production.databases).toEqual([{ name: 'app-production', id: PLACEHOLDER_ID }])
  })

  it('finds the buckets, queues (with dead letters) and domain an add-on declares', () => {
    const { production } = readResources(withAddons)
    expect(production.buckets).toEqual(['app-files-production'])
    expect(production.queues).toEqual(['app-jobs-production', 'app-jobs-production-dlq'])
    expect(production.hosts).toEqual(['app.example.com'])
  })

  it('writes one database id and keeps every comment', () => {
    const next = setDatabaseId(PACK_CONFIG, 'app-production', '11111111-2222-3333-4444-555555555555')
    expect(next.split('\n').filter((l) => l.trim().startsWith('//'))).toEqual(
      PACK_CONFIG.split('\n').filter((l) => l.trim().startsWith('//')),
    )
    const r = readResources(next)
    expect(r.production.databases[0]!.id).toBe('11111111-2222-3333-4444-555555555555')
    expect(r.test.databases[0]!.id).toBe(PLACEHOLDER_ID)
    const parsed = JSON.parse(stripJsonc(next)) as { d1_databases: Array<{ database_id: string }> }
    expect(parsed.d1_databases[0]?.database_id).toBe(PLACEHOLDER_ID)
    expect(() => setDatabaseId(PACK_CONFIG, 'nope', 'x')).toThrow(/nope/)
  })

  it('strips comments but not comment-like text inside strings', () => {
    expect(JSON.parse(stripJsonc('{ "a": "http://x//y", /* c */ "b": [1,], // d\n }'))).toEqual({
      a: 'http://x//y',
      b: [1],
    })
  })
})

describe('setup-cloudflare', () => {
  it('stops and asks for `wrangler login` when not signed in', async () => {
    const world = { ...freshWorld(), loggedIn: false }
    const { code, calls, output } = await run(world, { 'wrangler.jsonc': PACK_CONFIG })
    expect(code).toBe(2)
    expect(output()).toContain('pnpm exec wrangler login')
    expect(calls).toEqual(['wrangler whoami --json'])
  })

  it('asks which account when the login has several', async () => {
    const world = {
      ...freshWorld(),
      accounts: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    }
    const { code, output } = await run(world, { 'wrangler.jsonc': PACK_CONFIG })
    expect(code).toBe(2)
    expect(output()).toContain('--account <id>')
    expect((await run(world, { 'wrangler.jsonc': PACK_CONFIG }, { account: 'b' })).code).toBe(0)
  })

  it('a dry run reads but never creates, writes or sets anything', async () => {
    const files = { 'wrangler.jsonc': PACK_CONFIG, '.agents/skills/secrets/scripts/push-secrets.mjs': '' }
    const { code, calls, output } = await run(freshWorld(), files, { dryRun: true })
    expect(code).toBe(0)
    expect(calls.filter((c) => /create|write |secret set|api -X|remove/.test(c))).toEqual([])
    expect(calls).toContain('node .agents/skills/secrets/scripts/push-secrets.mjs --wrangler --dry-run')
    expect(output()).toContain('would create D1 database app-test (test)')
    expect(output()).toContain('would create D1 database app-production (production)')
    expect(output()).toContain('CLOUDFLARE_ACCOUNT_ID = acc_1')
    expect(output()).toContain('Account → D1 → Edit')
    expect(files['wrangler.jsonc']).toBe(PACK_CONFIG)
  })

  it('creates the databases, writes their ids, and does nothing the second time', async () => {
    const world = freshWorld()
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const first = await run(world, files)
    expect(first.code).toBe(0)
    expect(first.calls).toContain('wrangler d1 create app-test')
    expect(first.calls).toContain('wrangler d1 create app-production')
    const r = readResources(files['wrangler.jsonc']!)
    expect([r.test.databases[0]!.id, r.production.databases[0]!.id]).toEqual(['uuid-1', 'uuid-2'])

    const written = files['wrangler.jsonc']
    const second = await run(world, files)
    expect(second.calls.filter((c) => c.includes('create') || c.startsWith('write'))).toEqual([])
    expect(files['wrangler.jsonc']).toBe(written)
    expect(second.output()).toContain('exists  D1 database app-test (test)')
  })

  it('fills in ids for databases that already exist, without creating them', async () => {
    const world = {
      ...freshWorld(),
      databases: [
        { name: 'app-test', uuid: 'uuid-t' },
        { name: 'app-production', uuid: 'uuid-p' },
      ],
    }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const { calls } = await run(world, files)
    expect(calls.some((c) => c.includes('d1 create'))).toBe(false)
    expect(readResources(files['wrangler.jsonc']!).production.databases[0]!.id).toBe('uuid-p')
  })

  it('creates the R2 buckets and queues add-ons declare, only when missing', async () => {
    const world = { ...freshWorld(), queues: ['app-jobs-production'] }
    const { calls } = await run(world, { 'wrangler.jsonc': withAddons })
    expect(calls).toContain('wrangler r2 bucket create app-files-production')
    expect(calls).toContain('wrangler queues create app-jobs-production-dlq')
    expect(calls).not.toContain('wrangler queues create app-jobs-production')
    const again = await run(world, { 'wrangler.jsonc': withAddons })
    expect(again.calls.filter((c) => c.includes(' create '))).toEqual([])
  })

  it('sets the account id in all three GitHub environments, never the token', async () => {
    const { calls, output } = await run(freshWorld(), { 'wrangler.jsonc': PACK_CONFIG })
    for (const env of ['test', 'production', 'preview'])
      expect(calls).toContain(`gh secret set CLOUDFLARE_ACCOUNT_ID --env ${env}`)
    expect(calls).toContain('gh api -X PUT repos/ann/app/environments/preview')
    expect(calls.some((c) => c.includes('CLOUDFLARE_API_TOKEN'))).toBe(false)
    expect(output()).toContain('gh secret set CLOUDFLARE_API_TOKEN --env production')
  })

  it('pushes the app secrets with --wrangler, after removing a stale build redirect', async () => {
    const files = {
      'wrangler.jsonc': PACK_CONFIG,
      '.agents/skills/secrets/scripts/push-secrets.mjs': '',
      '.wrangler/deploy/config.json': '{}',
    }
    const { calls } = await run(freshWorld(), files)
    const removed = calls.indexOf('remove .wrangler/deploy/config.json')
    const pushed = calls.indexOf('node .agents/skills/secrets/scripts/push-secrets.mjs --wrangler')
    expect(removed).toBeGreaterThan(-1)
    expect(pushed).toBeGreaterThan(removed)
  })

  it('skips the zone without a domain, and explains the token without one', async () => {
    expect((await run(freshWorld(), { 'wrangler.jsonc': PACK_CONFIG })).output()).toContain(
      'zone settings skipped',
    )
    const noToken = await run({ ...freshWorld(), zone: blankZone() }, { 'wrangler.jsonc': withAddons })
    expect(noToken.output()).toContain('Zone → Zone Settings: Edit')
    expect(noToken.writes).toEqual([])
  })

  it('applies the free zone settings once, finding the zone from the production route', async () => {
    const world = { ...freshWorld(), zone: blankZone() }
    const files = { 'wrangler.jsonc': withAddons }
    const token = { CLOUDFLARE_ZONE_TOKEN: 'set' }
    const dry = await run(world, files, { dryRun: true }, token)
    expect(dry.writes).toEqual([])
    expect(dry.output()).toContain('would set Always Use HTTPS: on')

    const first = await run(world, files, {}, token)
    expect(first.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'PATCH /zones/zone_1/settings/always_use_https',
      'PATCH /zones/zone_1/settings/min_tls_version',
      'PUT /zones/zone_1/bot_management',
      'PUT /zones/zone_1/rulesets/phases/http_request_firewall_custom/entrypoint',
    ])
    // Training disallowed, never blocked; Bot Fight Mode and managed robots.txt stay off.
    expect(first.writes[2]!.body).toEqual({ ai_training: 'disallow' })
    expect(first.output()).toContain('Bot Fight Mode: off, recommended on')
    expect(world.zone.waf!.rules[0]).toMatchObject({ ref: SCANNER_RULE_REF })
    expect(world.zone.waf!.rules[0]!.expression).toContain('http.host in {"app.example.com"}')

    const second = await run(world, files, {}, token)
    expect(second.writes).toEqual([])
    expect(second.output()).toContain('already set')
  })

  it('adds the scanner rule beside existing rules, updates it in place, keeps TLS 1.3', async () => {
    const zone = {
      ...blankZone(),
      min_tls_version: '1.3',
      waf: { id: 'rs_9', rules: [{ id: 'mine', expression: 'true' }] },
    }
    const world = { ...freshWorld(), zone }
    const token = { CLOUDFLARE_ZONE_TOKEN: 'set' }
    const first = await run(world, { 'wrangler.jsonc': withAddons }, {}, token)
    expect(first.writes.map((w) => `${w.method} ${w.path}`)).toContain(
      'POST /zones/zone_1/rulesets/rs_9/rules',
    )
    expect(first.writes.some((w) => w.path.endsWith('min_tls_version'))).toBe(false)
    zone.waf.rules[1]!.expression = 'old'
    const second = await run(world, { 'wrangler.jsonc': withAddons }, {}, token)
    expect(second.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'PATCH /zones/zone_1/rulesets/rs_9/rules/r_2',
    ])
    expect(zone.waf.rules.map((r) => r.id)).toEqual(['mine', 'r_2'])
  })

  it('turns on Bot Fight Mode and managed robots.txt only when asked', async () => {
    const world = { ...freshWorld(), zone: blankZone() }
    const { writes } = await run(
      world,
      { 'wrangler.jsonc': withAddons },
      { botFightMode: true, managedRobots: true },
      { CLOUDFLARE_ZONE_TOKEN: 'set' },
    )
    expect(writes.find((w) => w.path.endsWith('bot_management'))!.body).toEqual({
      ai_training: 'disallow',
      fight_mode: true,
      is_robots_txt_managed: true,
    })
  })
})

describe('the scanner rule', () => {
  it('blocks the same paths the Worker answers with a plain 404', () => {
    for (const ext of SCANNER_EXTENSIONS) expect(SCANNER_PATH.test(`/x${ext}`), ext).toBe(true)
    for (const prefix of SCANNER_PREFIXES) expect(SCANNER_PATH.test(`${prefix}x`), prefix).toBe(true)
  })

  it('uses only Free-plan functions, scoped to the app’s hosts, within the length limit', () => {
    const expression = scannerRuleExpression(['app.example.com'])
    expect(expression).not.toMatch(/matches|~/)
    expect(expression).toMatch(/ and http\.host in \{"app\.example\.com"\}$/)
    expect(expression.length).toBeLessThan(4096)
  })
})
