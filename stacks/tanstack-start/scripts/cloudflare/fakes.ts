// Fake Cloudflare, GitHub and file system for the setup tests: a `World` the fakes read and change.
import { readFileSync } from 'node:fs'

import { type ApiResult, type Deps, type Options } from './deps'
import { setupCloudflare } from './setup'

export const LIVE_CONFIG = readFileSync('wrangler.jsonc', 'utf8')

/** The pack's shape, fixed here so add-ons that change wrangler.jsonc don't change these tests. */
export const PACK_CONFIG = `// Edit this file.
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
export const withAddons = PACK_CONFIG.replace(
  '"name": "app-production",',
  `"name": "app-production",
      "r2_buckets": [{ "binding": "FILES", "bucket_name": "app-files-production" }],
      "queues": {
        "producers": [{ "binding": "JOBS", "queue": "app-jobs-production" }],
        "consumers": [{ "queue": "app-jobs-production", "dead_letter_queue": "app-jobs-production-dlq" }],
      },
      "routes": [{ "pattern": "app.example.com", "custom_domain": true }],`,
)

export interface World {
  loggedIn: boolean
  accounts: { id: string; name: string }[]
  databases: { name: string; uuid: string }[]
  buckets: string[]
  queues: string[]
  ghSignedIn: boolean
  /** Secrets on the test Worker. */
  testSecrets: string[]
  /** Workers deployed on the account, by name (`wrangler versions list --name`). */
  deployed: string[]
  /** The step of the first test deploy that fails: `pnpm build`, `d1 migrations` or `deploy`. */
  failing?: string
  /** `wrangler versions list` fails for another reason than a missing Worker. */
  versionsBroken?: boolean
  /** Cloudflare One on the account; null: Zero Trust not set up. */
  access: {
    workers: { id: string; name: string }[]
    idps: { id: string; type: string }[]
    tokens: { id: string; name: string }[]
    apps: ({ id: string; name: string; aud: string } & Record<string, unknown>)[]
    /** The account's workers.dev subdomain. */
    subdomain?: string
  } | null
  zone: {
    always_use_https: string
    min_tls_version: string
    bots: Record<string, unknown>
    waf: { id: string; rules: { id: string; ref?: string; expression: string }[] } | null
  } | null
}

export const freshWorld = (): World => ({
  loggedIn: true,
  accounts: [{ id: 'acc_1', name: 'Ann’s account' }],
  databases: [],
  buckets: [],
  queues: [],
  ghSignedIn: true,
  testSecrets: [],
  deployed: [],
  access: null,
  zone: null,
})

export const zeroTrust = (): NonNullable<World['access']> => ({
  workers: [
    { id: 'w_test', name: 'app-test' },
    { id: 'w_prod', name: 'app-production' },
  ],
  subdomain: 'ann',
  idps: [],
  tokens: [],
  apps: [],
})

export const blankZone = (): NonNullable<World['zone']> => ({
  always_use_https: 'off',
  min_tls_version: '1.0',
  bots: { fight_mode: false, ai_training: 'disabled', is_robots_txt_managed: false },
  waf: null,
})

/** Fakes for wrangler, gh, node, the Cloudflare API and the files, over one mutable world. */
export function fakes(
  world: World,
  files: Record<string, string>,
  env: Record<string, string | undefined> = {},
) {
  const calls: string[] = []
  const writes: { method: string; path: string; body: unknown }[] = []
  const lines: string[] = []
  let ids = 0
  const ok = (stdout = '') => Promise.resolve({ status: 0, stdout, stderr: '' })
  const deps: Deps = {
    async wrangler(args, input, extraEnv) {
      const cmd = args.join(' ')
      calls.push(`${prefix(extraEnv)}wrangler ${cmd}${input === undefined ? '' : ' <stdin>'}`)
      const deploying = firstDeploy(args, extraEnv)
      if (deploying) return deploying
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
    async run(cmd, args, input, extraEnv) {
      calls.push(`${prefix(extraEnv)}${cmd} ${args.join(' ')}`)
      if (input !== undefined) stdin.push(input)
      if (cmd === 'pnpm' && args[0] === 'build') {
        if (world.failing === 'pnpm build') return { status: 1, stdout: '', stderr: 'vite build failed' }
        files['.wrangler/deploy/config.json'] = '{"configPath":"../../dist/server/wrangler.json"}'
        return ok('✓ built')
      }
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
    secret: (name) => env[name],
    env,
  }
  const stdin: string[] = []
  const prefix = (e?: Record<string, string>) =>
    Object.entries(e ?? {})
      .map(([k, v]) => `${k}=${v} `)
      .join('')
  /** The first test deploy's commands: the check, the migrations and the deploy. */
  function firstDeploy(args: string[], extraEnv?: Record<string, string>) {
    const cmd = args.join(' ')
    if (args[0] === 'versions' && args[1] === 'list') return versionsList(args[3]!)
    if (!/^(d1 migrations|deploy)/.test(cmd)) return undefined
    if (world.failing && cmd.startsWith(world.failing))
      return { status: 1, stdout: '', stderr: `✘ [ERROR] ${world.failing} broke` }
    return args[0] === 'deploy' ? deploy(extraEnv) : ok('✅ Applied 1 migration')
  }
  function versionsList(name: string) {
    if (world.versionsBroken) return { status: 1, stdout: '', stderr: '✘ [ERROR] fetch failed' }
    if (world.deployed.includes(name)) return ok(JSON.stringify([{ id: 'v1', number: 1 }]))
    return {
      status: 1,
      stdout: '',
      stderr: `✘ [ERROR] A request to the Cloudflare API (/accounts/acc_1/workers/scripts/${name}/versions) failed.\n\n  This Worker does not exist on your account. [code: 10007]`,
    }
  }
  /** Deploys the Worker the build's flattened config names: env.test's, under CLOUDFLARE_ENV=test. */
  function deploy(extraEnv?: Record<string, string>) {
    const env = extraEnv?.CLOUDFLARE_ENV
    const name = env ? `app-${env}` : 'app'
    world.deployed.push(name)
    if (world.access && !world.access.workers.some((w) => w.name === name))
      world.access.workers.push({ id: `w_${env ?? 'local'}`, name })
    return ok(`Uploaded ${name}\nDeployed ${name} triggers\n  https://${name}.ann.workers.dev\n`)
  }
  function accountApi(method: string, path: string, body: unknown): ApiResult {
    const a = world.access
    const ok = (result: unknown) => ({ status: 200, body: { success: true, result } })
    if (method !== 'GET') writes.push({ method, path, body })
    if (!a) return { status: 403, body: { success: false, errors: [{ message: 'not enabled' }] } }
    const tail = path.replace('/accounts/acc_1', '')
    if (tail === '/access/organizations') return ok({ auth_domain: 'ann.cloudflareaccess.com' })
    if (tail.startsWith('/workers/workers')) return ok(a.workers)
    if (tail === '/access/identity_providers' && method === 'GET') return ok(a.idps)
    if (tail === '/access/identity_providers') {
      const id = `idp_${a.idps.length + 1}`
      a.idps.push({ id, type: (body as { type: string }).type })
      return ok({ id })
    }
    if (tail === '/workers/subdomain') return ok({ subdomain: a.subdomain })
    if (tail === '/access/service_tokens' && method === 'GET') return ok(a.tokens)
    if (tail === '/access/service_tokens') {
      a.tokens.push({ id: 'tok_1', name: (body as { name: string }).name })
      return ok({ id: 'tok_1', client_id: 'id.access', client_secret: 'cfast_SECRET' })
    }
    if (tail === '/access/apps' && method === 'GET') return ok(a.apps)
    if (tail === '/access/apps') {
      const n = a.apps.length + 1
      const app = { ...(body as { name: string }), id: `app_${n}`, aud: String(n).repeat(64) }
      a.apps.push(app)
      return ok(app)
    }
    const put = /^\/access\/apps\/(.+)$/.exec(tail)
    const old = put && method === 'PUT' ? a.apps.find((x) => x.id === put[1]) : undefined
    if (old) {
      Object.assign(old, body)
      return ok(old)
    }
    return { status: 404, body: null }
  }
  return { deps, calls, writes, stdin, output: () => lines.join('\n') }
}

export const run = (
  world: World,
  files: Record<string, string>,
  options: Partial<Options> = {},
  env = {},
) => {
  const f = fakes(world, files, env)
  return setupCloudflare({ dryRun: false, ...options }, f.deps).then((code) => ({ code, ...f }))
}
