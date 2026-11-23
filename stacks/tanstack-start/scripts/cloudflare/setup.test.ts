import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCANNER_PATH } from '@/lib/request-limits'
import {
  PLACEHOLDER_ID,
  accessAppBody,
  readResources,
  scannerRuleExpression,
  SCANNER_EXTENSIONS,
  SCANNER_PREFIXES,
  SCANNER_RULE_REF,
  setDatabaseId,
  setEnvVar,
  setupCloudflare,
  stripJsonc,
  type ApiResult,
  type Deps,
  type Options,
} from './setup'

const LIVE_CONFIG = readFileSync('wrangler.jsonc', 'utf8')

/** The pack's shape, fixed here so add-ons that change wrangler.jsonc don't change these tests. */
const PACK_CONFIG = `// Edit this file.
{
  "name": "app",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "app",
      // Local only.
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations",
    },
  ],
  "env": {
    "test": {
      "name": "app-test",
      // setup-cloudflare writes the choice here.
      "vars": { "LAUNCHED": "true", "SITE_PROTECTION": "none" },
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "app-test",
          "database_id": "00000000-0000-0000-0000-000000000000",
          "migrations_dir": "migrations",
        },
      ],
    },
    "production": {
      "name": "app-production",
      "vars": { "LAUNCHED": "false", "SITE_PROTECTION": "none" },
      // A comment the setup must keep.
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "app-production",
          "database_id": "00000000-0000-0000-0000-000000000000",
          "migrations_dir": "migrations",
        },
      ],
      // "routes": [{ "pattern": "app.example.com", "custom_domain": true }],
    },
  },
}
`

/** The pack's config plus what the r2-uploads and jobs add-ons and a custom domain add. */
const withAddons = PACK_CONFIG.replace(
  '"name": "app-production",',
  `"name": "app-production",
      "r2_buckets": [{ "binding": "FILES", "bucket_name": "app-files-production" }],
      "queues": {
        "producers": [{ "binding": "JOBS", "queue": "app-jobs-production" }],
        "consumers": [{ "queue": "app-jobs-production", "dead_letter_queue": "app-jobs-production-dlq" }],
      },
      "routes": [{ "pattern": "app.example.com", "custom_domain": true }],`,
)

interface World {
  loggedIn: boolean
  accounts: { id: string; name: string }[]
  databases: { name: string; uuid: string }[]
  buckets: string[]
  queues: string[]
  ghSignedIn: boolean
  /** Secrets on the test Worker. */
  testSecrets: string[]
  /** Cloudflare One on the account; null: Zero Trust not set up. */
  access: {
    workers: { id: string; name: string }[]
    idps: { id: string; type: string }[]
    tokens: { id: string; name: string }[]
    apps: { id: string; name: string; destinations: { type: string; worker_id: string }[] }[]
  } | null
  zone: {
    always_use_https: string
    min_tls_version: string
    bots: Record<string, unknown>
    waf: { id: string; rules: { id: string; ref?: string; expression: string }[] } | null
  } | null
}

const freshWorld = (): World => ({
  loggedIn: true,
  accounts: [{ id: 'acc_1', name: 'Ann’s account' }],
  databases: [],
  buckets: [],
  queues: [],
  ghSignedIn: true,
  testSecrets: [],
  access: null,
  zone: null,
})

const zeroTrust = (): NonNullable<World['access']> => ({
  workers: [{ id: 'w_test', name: 'app-test' }],
  idps: [],
  tokens: [],
  apps: [],
})

const blankZone = (): NonNullable<World['zone']> => ({
  always_use_https: 'off',
  min_tls_version: '1.0',
  bots: { fight_mode: false, ai_training: 'disabled', is_robots_txt_managed: false },
  waf: null,
})

/** Fakes for wrangler, gh, node, the Cloudflare API and the files, over one mutable world. */
function fakes(world: World, files: Record<string, string>, env: Record<string, string | undefined> = {}) {
  const calls: string[] = []
  const writes: { method: string; path: string; body: unknown }[] = []
  const lines: string[] = []
  let ids = 0
  const ok = (stdout = '') => Promise.resolve({ status: 0, stdout, stderr: '' })
  const deps: Deps = {
    async wrangler(args, input) {
      const cmd = args.join(' ')
      calls.push(`wrangler ${cmd}${input === undefined ? '' : ' <stdin>'}`)
      if (cmd === 'secret list --env test --format json')
        return ok(JSON.stringify(world.testSecrets.map((name) => ({ name, type: 'secret_text' }))))
      if (cmd === 'secret put SITE_PASSWORD --env test') {
        world.testSecrets.push('SITE_PASSWORD')
        stdin.push(input ?? '')
        return ok()
      }
      if (cmd === 'whoami --json')
        return world.loggedIn
          ? ok(`⛅️ wrangler\n${JSON.stringify({ loggedIn: true, accounts: world.accounts })}`)
          : { status: 1, stdout: '', stderr: 'You are not authenticated.' }
      if (cmd === 'd1 list --json') return ok(JSON.stringify(world.databases))
      if (args[0] === 'd1' && args[1] === 'create') {
        world.databases.push({ name: args[2]!, uuid: `uuid-${++ids}` })
        return ok('✅ Successfully created DB')
      }
      if (cmd === 'r2 bucket list') return ok(world.buckets.map((b) => `name:           ${b}\n`).join(''))
      if (args[0] === 'r2' && args[2] === 'create') return (world.buckets.push(args[3]!), ok())
      if (cmd === 'queues list') return ok(`│ ${world.queues.join(' │\n│ ')} │`)
      if (args[0] === 'queues' && args[1] === 'create') return (world.queues.push(args[2]!), ok())
      throw new Error(`unexpected wrangler ${cmd}`)
    },
    async run(cmd, args, input) {
      calls.push(`${cmd} ${args.join(' ')}`)
      if (input !== undefined) stdin.push(input)
      if (cmd === 'gh' && args[0] === 'auth')
        return { status: world.ghSignedIn ? 0 : 1, stdout: '', stderr: '' }
      if (cmd === 'gh' && args[0] === 'repo') return ok('ann/app\n')
      if (cmd === 'node')
        return ok(
          args.includes('--dry-run') ? 'test: would set CLERK_SECRET_KEY' : 'test: set CLERK_SECRET_KEY',
        )
      return ok()
    },
    async api(method, path, body): Promise<ApiResult> {
      if (path.startsWith('/accounts/')) return accountApi(method, path, body)
      const zone = world.zone
      const z = '/zones/zone_1'
      if (method !== 'GET') writes.push({ method, path, body })
      if (method === 'GET' && path.startsWith('/zones?name='))
        return {
          status: 200,
          body: {
            result: zone && path === '/zones?name=example.com' ? [{ id: 'zone_1', name: 'example.com' }] : [],
          },
        }
      if (!zone) return { status: 404, body: null }
      if (method === 'GET' && path === `${z}/settings/always_use_https`)
        return { status: 200, body: { result: { value: zone.always_use_https } } }
      if (method === 'GET' && path === `${z}/settings/min_tls_version`)
        return { status: 200, body: { result: { value: zone.min_tls_version } } }
      if (method === 'GET' && path === `${z}/bot_management`)
        return { status: 200, body: { result: { ...zone.bots } } }
      if (method === 'GET' && path.endsWith('/entrypoint'))
        return zone.waf
          ? { status: 200, body: { result: zone.waf } }
          : { status: 404, body: { success: false } }
      const value = (body as { value?: string } | undefined)?.value
      if (path.endsWith('always_use_https')) zone.always_use_https = value!
      else if (path.endsWith('min_tls_version')) zone.min_tls_version = value!
      else if (path.endsWith('bot_management')) Object.assign(zone.bots, body)
      else if (path.endsWith('/entrypoint'))
        zone.waf = {
          id: 'rs_1',
          rules: [{ id: 'r_1', ...(body as { rules: { ref: string; expression: string }[] }).rules[0]! }],
        }
      else if (method === 'POST')
        zone.waf!.rules.push({ id: 'r_2', ...(body as { ref: string; expression: string }) })
      else if (method === 'PATCH')
        zone.waf!.rules = zone.waf!.rules.map((r) =>
          path.endsWith(r.id) ? { ...r, ...(body as object) } : r,
        )
      return { status: 200, body: { success: true } }
    },
    readText: (p) => files[p] ?? '',
    writeText: (p, t) => {
      calls.push(`write ${p}`)
      files[p] = t
    },
    exists: (p) => p in files,
    remove: (p) => {
      calls.push(`remove ${p}`)
      delete files[p]
    },
    log: (line) => lines.push(line),
    randomSecret: () => 'Zx81_random-SECRET-value-0123456',
    env,
  }
  const stdin: string[] = []
  function accountApi(method: string, path: string, body: unknown): ApiResult {
    const a = world.access
    const ok = (result: unknown) => ({ status: 200, body: { success: true, result } })
    if (method !== 'GET') writes.push({ method, path, body })
    if (!a) return { status: 403, body: { success: false, errors: [{ message: 'not enabled' }] } }
    const tail = path.replace('/accounts/acc_1', '')
    if (tail === '/access/organizations') return ok({ auth_domain: 'ann.cloudflareaccess.com' })
    if (tail.startsWith('/workers/workers')) return ok(a.workers)
    if (tail === '/access/identity_providers' && method === 'GET') return ok(a.idps)
    if (tail === '/access/identity_providers')
      return (a.idps.push({ id: 'idp_1', type: 'onetimepin' }), ok({ id: 'idp_1' }))
    if (tail === '/access/service_tokens' && method === 'GET') return ok(a.tokens)
    if (tail === '/access/service_tokens') {
      a.tokens.push({ id: 'tok_1', name: (body as { name: string }).name })
      return ok({ id: 'tok_1', client_id: 'id.access', client_secret: 'cfast_SECRET' })
    }
    if (tail === '/access/apps' && method === 'GET') return ok(a.apps)
    if (tail === '/access/apps') {
      a.apps.push({
        id: 'app_1',
        ...(body as { name: string; destinations: { type: string; worker_id: string }[] }),
      })
      return ok({ id: 'app_1' })
    }
    return { status: 404, body: null }
  }
  return { deps, calls, writes, stdin, output: () => lines.join('\n') }
}

const run = (world: World, files: Record<string, string>, options: Partial<Options> = {}, env = {}) => {
  const f = fakes(world, files, env)
  return setupCloudflare({ dryRun: false, ...options }, f.deps).then((code) => ({ code, ...f }))
}

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
    expect(JSON.parse(stripJsonc(next)).d1_databases[0].database_id).toBe(PLACEHOLDER_ID)
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

describe('test and preview protection', () => {
  const ACCESS = { CLOUDFLARE_ACCESS_TOKEN: 'set' }

  it('a dry run shows the three choices and the Bot Fight Mode option, and changes nothing', async () => {
    const files = { 'wrangler.jsonc': withAddons }
    const { code, output, writes, calls } = await run({ ...freshWorld(), zone: blankZone() }, files, {
      dryRun: true,
    })
    expect(code).toBe(0)
    expect(output()).toContain('a) Cloudflare Access (recommended)')
    expect(output()).toContain('b) A password page in the app')
    expect(output()).toContain('c) None')
    expect(output()).toContain('Bot Fight Mode: recommended for app.example.com')
    expect(writes).toEqual([])
    expect(calls.filter((c) => c.startsWith('write'))).toEqual([])
    const noDomain = await run(freshWorld(), { 'wrangler.jsonc': PACK_CONFIG }, { dryRun: true })
    expect(noDomain.output()).toContain('Bot Fight Mode: needs the production custom domain first')
  })

  it('writes the choice into env.test only, keeping comments and the other vars', () => {
    const next = setEnvVar(PACK_CONFIG, 'test', 'SITE_PROTECTION', 'password')
    const r = readResources(next)
    expect(r.test.vars).toEqual({ LAUNCHED: 'true', SITE_PROTECTION: 'password' })
    expect(r.production.vars).toEqual({ LAUNCHED: 'false', SITE_PROTECTION: 'none' })
    expect(next.split('\n').filter((l) => l.trim().startsWith('//'))).toEqual(
      PACK_CONFIG.split('\n').filter((l) => l.trim().startsWith('//')),
    )
    expect(readResources(setEnvVar(PACK_CONFIG, 'production', 'EXTRA', 'x')).production.vars.EXTRA).toBe('x')
    expect(readResources(LIVE_CONFIG).test.vars.LAUNCHED).toBe('true')
  })

  it('password: makes a random secret, sets it on the test Worker and in GitHub, shows it once', async () => {
    const world = freshWorld()
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const dry = await run(world, files, { dryRun: true, protect: 'password' })
    expect(dry.calls.filter((c) => c.includes('secret put') || c.startsWith('write'))).toEqual([])
    const first = await run(world, files, { protect: 'password' })
    expect(first.calls).toContain('wrangler secret put SITE_PASSWORD --env test <stdin>')
    expect(first.calls).toContain('gh secret set SITE_PASSWORD --env test')
    expect(first.calls).toContain('gh secret set SITE_PASSWORD --env preview')
    expect(first.calls.some((c) => c.includes('--env production') && c.includes('SITE_PASSWORD'))).toBe(false)
    expect(first.stdin.filter((v) => v === 'Zx81_random-SECRET-value-0123456')).toHaveLength(3)
    expect(first.output().split('Zx81_random-SECRET-value-0123456')).toHaveLength(2) // printed once
    expect(readResources(files['wrangler.jsonc']!).test.vars.SITE_PROTECTION).toBe('password')
    const again = await run(world, files, { protect: 'password' })
    expect(again.calls.some((c) => c.includes('secret put'))).toBe(false)
    expect(again.output()).not.toContain('Zx81_random')
  })

  it('access: asks for the token and the email first, and needs Zero Trust and a deployed Worker', async () => {
    const files = { 'wrangler.jsonc': PACK_CONFIG }
    expect((await run(freshWorld(), files, { protect: 'access' })).output()).toContain(
      'CLOUDFLARE_ACCESS_TOKEN',
    )
    expect((await run(freshWorld(), files, { protect: 'access' }, ACCESS)).output()).toContain(
      '--access-email',
    )
    const opts = { protect: 'access' as const, accessEmail: 'ann@example.com' }
    expect((await run(freshWorld(), files, opts, ACCESS)).output()).toContain('Zero Trust is not set up')
    const undeployed = await run(
      { ...freshWorld(), access: { ...zeroTrust(), workers: [] } },
      files,
      opts,
      ACCESS,
    )
    expect(undeployed.output()).toContain('not deployed yet')
    expect(readResources(files['wrangler.jsonc']).test.vars.SITE_PROTECTION).toBe('none')
  })

  it('access: one-time PIN, a CI service token in GitHub, one app on the test Worker; idempotent', async () => {
    const world = { ...freshWorld(), access: zeroTrust() }
    const files: Record<string, string> = { 'wrangler.jsonc': PACK_CONFIG }
    const opts = { protect: 'access' as const, accessEmail: 'ann@example.com' }
    const dry = await run(world, files, { ...opts, dryRun: true }, ACCESS)
    expect(dry.writes).toEqual([])
    expect(dry.output()).not.toContain('ann@example.com')

    const first = await run(world, files, opts, ACCESS)
    expect(first.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'POST /accounts/acc_1/access/identity_providers',
      'POST /accounts/acc_1/access/service_tokens',
      'POST /accounts/acc_1/access/apps',
    ])
    expect(first.writes[2]!.body).toEqual(
      accessAppBody({ id: 'w_test', name: 'app-test' }, 'idp_1', 'tok_1', 'ann@example.com'),
    )
    expect(first.writes[2]!.body).toMatchObject({
      destinations: [{ type: 'worker', worker_id: 'w_test' }],
      policies: [
        { decision: 'non_identity', include: [{ service_token: { token_id: 'tok_1' } }] },
        { decision: 'allow', include: [{ email: { email: 'ann@example.com' } }] },
      ],
    })
    for (const name of ['CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET'])
      for (const env of ['test', 'preview'])
        expect(first.calls).toContain(`gh secret set ${name} --env ${env}`)
    expect(first.stdin).toContain('cfast_SECRET')
    expect(first.output()).not.toContain('cfast_SECRET')
    expect(readResources(files['wrangler.jsonc']!).test.vars.SITE_PROTECTION).toBe('access')
    expect(files['wrangler.jsonc']).not.toContain('ann@example.com')

    const second = await run(world, files, opts, ACCESS)
    expect(second.writes).toEqual([])
    expect(second.output()).toContain('exists  Access application')
  })

  it('none: records the choice and touches nothing on Cloudflare', async () => {
    const files: Record<string, string> = {
      'wrangler.jsonc': setEnvVar(PACK_CONFIG, 'test', 'SITE_PROTECTION', 'password'),
    }
    const { writes, output } = await run(freshWorld(), files, { protect: 'none' })
    expect(writes).toEqual([])
    expect(output()).toContain('open to anyone')
    expect(readResources(files['wrangler.jsonc']!).test.vars.SITE_PROTECTION).toBe('none')
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
