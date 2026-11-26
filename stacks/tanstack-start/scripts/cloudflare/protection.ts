// How the test Worker, its previews and (if the person wants) production are protected:
// Cloudflare Access, a password (test only), or none.
import {
  accessAppBody,
  type AccessContext,
  ensureApp,
  ensureLogins,
  type GithubWrites,
  githubWrites,
  missingLogins,
  results,
  type Target,
  type Who,
} from './access.ts'
import type { Deps, Log, Options } from './deps.ts'
import { LOCAL_FILE } from './local-env.ts'
import { LOGIN_NAMES, type LoginName, parseLogins } from './logins.ts'
import { protectWithPassword } from './password.ts'
import { ensureServiceToken } from './service-token.ts'
import { type Account, type EnvName, type EnvResources, setEnvVar } from './wrangler-config.ts'

// ---------------------------------------------------------------- the person's choices

export const PROTECTION_CHOICES = [
  'a) Cloudflare Access (recommended): a Cloudflare sign-in page in front of the test Worker, its',
  '   workers.dev URL and every preview URL, static files included. Logins: Google (recommended),',
  '   GitHub, Facebook, LinkedIn, Yandex, Microsoft Entra or any OpenID Connect provider, and always',
  '   a one-time PIN by email. Who may sign in: a list of emails, an email domain, or a GitHub org.',
  '   The smoke tests get a service token. Free for small teams (Zero Trust Free plan).',
  '   Run: --protect access --logins google --allow-emails <their email>',
  '        (or --allow-domain company.com, or --logins github --allow-github-org <org>)',
  'b) A password page in the app (test and previews only): one random password, saved in',
  `   ${LOCAL_FILE}, never printed. Covers pages, server functions and /api/v1, not the static`,
  '   files. Run: --protect password',
  'c) None: anyone with the URL can open the test site (it stays out of search). Run: --protect none',
]

export const PRODUCTION_CHOICES = [
  'Production is open to everyone (the Coming soon page until launch). Access can also go in front of:',
  '  - all of production: --protect-production all (the internal-tool preset’s default)',
  '  - some paths only:   --protect-production /admin/*,/ops/*',
  'Same logins and people as above. Production is on the always-stop list: dry run, show the person,',
  'and add --production-ok to the real run only after their yes.',
]

export const ACCESS_TOKEN_HELP = [
  'Cloudflare Access needs an account token (never give it to a deploy): My Profile → API Tokens → Create',
  'Custom Token with Account → Access: Apps and Policies → Edit, Access: Service Tokens → Edit,',
  'Access: Organizations, Identity Providers, and Groups → Edit, Workers Scripts → Read;',
  'Account Resources: this account only; an expiry. Put it in .env.cloudflare.local (git-ignored)',
  'as CLOUDFLARE_ACCESS_TOKEN=..., then run this again.',
]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i
const GITHUB_ORG = /^[a-z\d](?:[a-z\d-]{0,38})$/i
/** The same rule the Worker's env schema applies to ACCESS_PATHS. */
const PATH = /^\/[\w\-./]*\*?$/

/** Who may sign in, from the flags; or what is wrong with them. Values are never printed. */
export function readWho(options: Options, logins: LoginName[]): { who?: Who; problem?: string } {
  const emails = [...(options.allowEmails ?? []), ...(options.accessEmail ? [options.accessEmail] : [])]
  const domains = (options.allowDomains ?? []).map((d) => d.replace(/^@/, '').toLowerCase())
  const githubOrg = options.allowGithubOrg
  if (!emails.length && !domains.length && !githubOrg)
    return {
      problem:
        'Ask the person who may sign in, then run again with --allow-emails a@x.com,b@y.com, --allow-domain company.com or --allow-github-org <org>. Emails are never written to a file.',
    }
  if (emails.some((e) => !EMAIL.test(e))) return { problem: 'One of the emails given is not an email.' }
  if (domains.some((d) => !DOMAIN.test(d)))
    return { problem: '--allow-domain takes a domain like company.com.' }
  if (githubOrg && !GITHUB_ORG.test(githubOrg))
    return { problem: '--allow-github-org takes the org’s name as in github.com/<org>.' }
  if (githubOrg && !logins.includes('github'))
    return { problem: '--allow-github-org needs the GitHub login: add --logins github.' }
  return { who: { emails, domains, githubOrg } }
}

/** `--protect-production all` → ['/*']; `/admin/*,/ops/*` → those; or what is wrong. */
export function readProductionPaths(value: string): { paths?: string[]; problem?: string } {
  if (value === 'all') return { paths: ['/*'] }
  const paths = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!paths.length || paths.some((p) => !PATH.test(p)))
    return { problem: '--protect-production takes all, or paths like /admin/*,/ops/* (each starts with /).' }
  return { paths }
}

// ---------------------------------------------------------------- Cloudflare Access

interface Ready {
  ctx: AccessContext
  worker: { id: string; name: string }
  who: Who
  logins: LoginName[]
}

/** Everything Access needs before any write: the token, the people, Zero Trust, the Worker, the clients. */
async function accessReady(
  deps: Deps,
  options: Options,
  log: Log,
  chosen: Account,
  workerName: string,
  github: GithubWrites,
  /** A dry run whose first test deploy would make the Worker: plan against its name. */
  deployPlanned = false,
): Promise<Ready | null> {
  if (!deps.env.CLOUDFLARE_ACCESS_TOKEN) {
    for (const line of ACCESS_TOKEN_HELP) log(line)
    return null
  }
  const parsed = parseLogins(options.logins)
  if (parsed.problem) return (log(parsed.problem), null)
  const { logins } = parsed
  if (!options.logins)
    log(
      `Logins: one-time PIN only. Google is the recommended login: --logins google (any of ${LOGIN_NAMES.join(', ')}).`,
    )
  const { who, problem } = readWho(options, logins)
  if (!who) return (log(problem ?? 'Who may sign in?'), null)
  const a = `/accounts/${chosen.id}`
  const org = results<{ auth_domain: string }>(await deps.api('GET', `${a}/access/organizations`))
  if (!org) {
    log(
      'Zero Trust is not set up on this account yet. The person opens Zero Trust in the Cloudflare dashboard once and picks the Free plan (it can ask for a payment method: that is their call), then run this again.',
    )
    return null
  }
  const workers =
    results<{ id: string; name: string }[]>(await deps.api('GET', `${a}/workers/workers?per_page=100`)) ?? []
  let worker = workers.find((w) => w.name === workerName)
  if (!worker && deployPlanned) {
    log(`Access attaches to ${workerName} right after its first deploy (step 3), in the same run.`)
    worker = { id: 'after-the-first-deploy', name: workerName }
  }
  if (!worker) {
    log(
      `The Worker ${workerName} is not deployed yet, so Access has nothing to attach to. Run this again without --no-first-deploy: it deploys the Coming soon page first and attaches Access right after.`,
    )
    return null
  }
  const ctx: AccessContext = { deps, log, dryRun: options.dryRun, a, team: org.auth_domain, github }
  if (missingLogins(ctx, logins).length) return null
  return { ctx, worker, who, logins }
}

/** Logins, the smoke tests' token for `envs`, and the app. Returns the Worker vars to write, or null. */
async function applyAccess(ready: Ready, target: Target, envs: string[]) {
  const { ctx, who, logins } = ready
  const idps = await ensureLogins(ctx, logins)
  const token = await ensureServiceToken(ctx, ready.worker.name, envs)
  if (!token.ok) return null
  const body = accessAppBody(target, [...idps.values()], token.id, who, idps.get('github'))
  const app = await ensureApp(ctx, target, body)
  if (!app.ok) return null
  return {
    SITE_PROTECTION: 'access',
    ACCESS_TEAM_DOMAIN: `https://${ctx.team}`,
    ...(app.aud ? { ACCESS_AUD: app.aud } : {}),
  }
}

/** Writes changed vars into `env.<env>.vars` of wrangler.jsonc. Names only in the log. */
function writeVars(
  deps: Deps,
  options: Options,
  log: Log,
  env: EnvName,
  current: Record<string, string>,
  vars: Record<string, string>,
) {
  const changed = Object.entries(vars).filter(([k, v]) => current[k] !== v)
  if (!changed.length) return log(`exists  ${Object.keys(vars).join(', ')} in wrangler.jsonc env.${env}`)
  log(
    `${options.dryRun ? 'would write' : 'writing'} ${changed.map(([k]) => k).join(', ')} into wrangler.jsonc env.${env} (commit it; it applies on the next ${env} deploy)`,
  )
  if (options.dryRun) return
  let text = deps.readText('wrangler.jsonc')
  for (const [k, v] of changed) text = setEnvVar(text, env, k, v)
  deps.writeText('wrangler.jsonc', text)
}

/** Step 8: how the test Worker and its previews are protected. Records the choice in wrangler.jsonc. */
export async function protection(
  deps: Deps,
  options: Options,
  log: Log,
  resources: Record<EnvName, EnvResources>,
  chosen: Account,
  deployPlanned = false,
) {
  const current = resources.test.vars.SITE_PROTECTION ?? 'none'
  if (!options.protect) {
    log(`Now: ${current}. Ask the person which they want (the test URL and every preview URL):`)
    for (const line of PROTECTION_CHOICES) log(`  ${line}`)
    return
  }
  const github = await githubWrites(deps, options.ci)
  let vars: Record<string, string> | null = { SITE_PROTECTION: options.protect }
  if (options.protect === 'none')
    log('No protection: the test and preview URLs are open to anyone who has them (noindex).')
  else if (options.protect === 'password') {
    if (!(await protectWithPassword(deps, options, log, github))) vars = null
  } else {
    const ready = await accessReady(deps, options, log, chosen, resources.test.worker, github, deployPlanned)
    vars = ready && (await applyAccess(ready, { kind: 'test', worker: ready.worker }, ['test', 'preview']))
  }
  if (!vars) return log(`  SITE_PROTECTION stays "${current}".`)
  writeVars(deps, options, log, 'test', resources.test.vars, vars)
  if (current === 'access' && options.protect !== 'access')
    log('  The Access application stays: delete it in Zero Trust if the person no longer wants it.')
}

/** Step 9: Access in front of all of production or some paths. Only after the person's yes. */
export async function productionProtection(
  deps: Deps,
  options: Options,
  log: Log,
  resources: Record<EnvName, EnvResources>,
  chosen: Account,
) {
  const prod = resources.production
  if (!options.protectProduction) {
    if (prod.vars.SITE_PROTECTION === 'access')
      return log(`Now: Access on ${prod.vars.ACCESS_PATHS ?? '/*'} (env.production.vars).`)
    for (const line of PRODUCTION_CHOICES) log(line)
    return
  }
  const { paths, problem } = readProductionPaths(options.protectProduction)
  if (!paths) return log(problem ?? 'Which paths?')
  if (!options.dryRun && !options.productionOk) {
    log(
      'Stopped: production changes need the person’s yes (always-stop list). Run with --dry-run, show them the plan, and add --production-ok after they say yes.',
    )
    return
  }
  const ready = await accessReady(
    deps,
    options,
    log,
    chosen,
    prod.worker,
    await githubWrites(deps, options.ci),
  )
  if (!ready) return log('  Production stays as it is.')
  let target: Target = { kind: 'production', worker: ready.worker }
  if (paths[0] !== '/*') {
    const sub = results<{ subdomain: string }>(await deps.api('GET', `${ready.ctx.a}/workers/subdomain`))
    const hosts = [...(sub ? [`${prod.worker}.${sub.subdomain}.workers.dev`] : []), ...prod.hosts]
    if (!hosts.length) return log('No production hostname found (no workers.dev subdomain, no routes).')
    target = { kind: 'paths', worker: ready.worker, uris: hosts.flatMap((h) => paths.map((p) => h + p)) }
    log(`Access on ${paths.join(', ')} of ${hosts.join(', ')}; the rest of production stays open.`)
  } else log('Access on all of production: workers.dev, the custom domain and every path but OPEN_PATHS.')
  const vars = await applyAccess(ready, target, ['production'])
  if (!vars) return log('  Production stays as it is.')
  writeVars(deps, options, log, 'production', prod.vars, { ...vars, ACCESS_PATHS: paths.join(',') })
  log(
    `  The production deploy smoke-tests with the service token (PRODUCTION_CF_ACCESS_CLIENT_ID and PRODUCTION_CF_ACCESS_CLIENT_SECRET in ${LOCAL_FILE}).`,
  )
}
