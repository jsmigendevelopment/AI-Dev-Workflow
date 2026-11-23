#!/usr/bin/env node
// One-time Cloudflare setup for an app made from this pack. An agent runs it for the person:
// first with --dry-run (reads only), shows the result, and runs it for real only after a yes.
//   node scripts/setup-cloudflare.mjs --dry-run
//   node scripts/setup-cloudflare.mjs
// Options: --account <id> (several accounts), --zone <example.com> (default: the production
// routes' domain), --bot-fight-mode (recommended once the custom domain exists), --managed-robots,
// --skip-secrets, and the person's choice for the test and preview URLs:
//   --protect access --access-email <their email>   Cloudflare Access (recommended)
//   --protect password [--new-password]             a password page in the app
//   --protect none
// Run it again any time: it skips what exists.
//
// It needs `wrangler login` (the person runs it); for zone settings, a zone token in
// CLOUDFLARE_ZONE_TOKEN; for Cloudflare Access, an account token in CLOUDFLARE_ACCESS_TOKEN.
// Either can live in .env.cloudflare.local (git-ignored). It never prints a token.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setupCloudflare } from './cloudflare/setup.ts'

const args = process.argv.slice(2)
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)

function localToken(name) {
  if (process.env[name]) return process.env[name]
  if (!existsSync('.env.cloudflare.local')) return undefined
  const line = readFileSync('.env.cloudflare.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`))
  return (
    line
      ?.slice(name.length + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2') || undefined
  )
}

const token = localToken('CLOUDFLARE_ZONE_TOKEN')
const accessToken = localToken('CLOUDFLARE_ACCESS_TOKEN')
const env = {
  ...process.env,
  CLOUDFLARE_ZONE_TOKEN: token ? 'set' : undefined,
  CLOUDFLARE_ACCESS_TOKEN: accessToken ? 'set' : undefined,
  WRANGLER_SEND_METRICS: 'false',
}

// Child processes never see either token.
function run(cmd, cmdArgs, input) {
  const childEnv = { ...env }
  delete childEnv.CLOUDFLARE_ZONE_TOKEN
  delete childEnv.CLOUDFLARE_ACCESS_TOKEN
  const result = spawnSync(cmd, cmdArgs, { input, encoding: 'utf8', env: childEnv })
  return Promise.resolve({
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr || result.error?.message || '',
  })
}

async function api(method, path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${path.startsWith('/accounts') ? accessToken : token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

const protect = value('--protect')
if (protect !== undefined && !['access', 'password', 'none'].includes(protect)) {
  console.log('--protect takes access, password or none.')
  process.exit(2)
}

const code = await setupCloudflare(
  {
    dryRun: args.includes('--dry-run'),
    zone: value('--zone'),
    account: value('--account'),
    botFightMode: args.includes('--bot-fight-mode'),
    managedRobots: args.includes('--managed-robots'),
    skipSecrets: args.includes('--skip-secrets'),
    protect: value('--protect'),
    accessEmail: value('--access-email'),
    newPassword: args.includes('--new-password'),
  },
  {
    wrangler: (a, input) => run('pnpm', ['exec', 'wrangler', ...a], input),
    run,
    api,
    randomSecret: () => randomBytes(24).toString('base64url'),
    readText: (p) => readFileSync(p, 'utf8'),
    writeText: (p, t) => writeFileSync(p, t),
    exists: existsSync,
    remove: (p) => rmSync(p, { force: true }),
    log: (line) => console.log(line),
    env,
  },
)
process.exit(code)
