// The deploys, run from the agent's session (the pack ships no GitHub Actions workflows):
//   pnpm deploy:preview <pr>     a preview of pull request <pr> on the test Worker, before review
//   pnpm deploy:test             main to the test site, after each merge
//   pnpm deploy:production --confirm "deploy production"   only after the person's yes
// Cloudflare sign-in: the person's `pnpm exec wrangler login`, or CLOUDFLARE_API_TOKEN in the shell.
// A protected site's smoke test reads TEST_CF_ACCESS_CLIENT_ID and TEST_CF_ACCESS_CLIENT_SECRET
// (or TEST_SITE_PASSWORD), and PRODUCTION_ ones for production, from the shell or
// .env.cloudflare.local (git-ignored). They go only to the child that runs the smoke test.
// The logic and its tests are in scripts/deploy/.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'

import { localValue } from './cloudflare/local-env.ts'
import type { ChildEnv, DeployDeps } from './deploy/deps.ts'
import { deployPreview } from './deploy/preview.ts'
import { deployProduction } from './deploy/production.ts'
import { Stop } from './deploy/shared.ts'
import { deployTest } from './deploy/test-site.ts'

function run(cmd: string, args: string[], extra: ChildEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  for (const [name, value] of Object.entries(extra))
    if (value === undefined) delete env[name]
    else env[name] = value
  const result = spawnSync(cmd, args, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 })
  return Promise.resolve({
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr || result.error?.message || '',
  })
}

async function status(url: string, headers: Record<string, string>) {
  try {
    return (await fetch(url, { headers, redirect: 'manual' })).status
  } catch {
    return 0 // no answer at all: the caller asks again, then stops
  }
}

const deps: DeployDeps = {
  run,
  wrangler: (args, env) => run('pnpm', ['exec', 'wrangler', ...args], env),
  status,
  local: (name) => localValue(name),
  readText: (path) => readFileSync(path, 'utf8'),
  exists: existsSync,
  remove: (path) => rmSync(path, { force: true }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (line) => console.log(line),
}

const [target, ...rest] = process.argv.slice(2)
const flag = (name: string) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined)
try {
  if (target === 'preview') await deployPreview(deps, rest[0] ?? '')
  else if (target === 'test') await deployTest(deps)
  else if (target === 'production') await deployProduction(deps, flag('--confirm'))
  else {
    console.error(
      'Usage: node scripts/deploy.ts preview <pr> | test | production --confirm "deploy production"',
    )
    process.exit(2)
  }
} catch (error) {
  if (!(error instanceof Stop)) throw error
  console.error(`Stopped: ${error.message}`)
  process.exit(1)
}
