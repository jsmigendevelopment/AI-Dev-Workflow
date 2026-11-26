// The logic behind scripts/setup-cloudflare.mjs, with every side effect injected (`Deps`), so the
// planning is unit-tested with fakes (setup.test.ts). Reads run in a dry run too; writes never do.
// It never prints a token or secret value: the ones it makes go to .env.cloudflare.local (mode 600).
import type { Deps, Log, Options } from './deps.ts'
import { firstTestDeploy } from './first-deploy.ts'
import { productionProtection, protection } from './protection.ts'
import {
  type Account,
  ENVIRONMENTS,
  type EnvName,
  type EnvResources,
  listsName,
  parseAccounts,
  parseD1List,
  readResources,
  setDatabaseId,
} from './wrangler-config.ts'
import { zone } from './zone.ts'

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

/** Step 4: the account id and the deploy token, for GitHub Actions. Only on `ci = "actions"`. */
async function github(deps: Deps, options: Options, log: Log, chosen: Account) {
  if (options.ci !== 'actions')
    return log(
      'None: docs/stack.md says ci = "local". The session deploys with the person\'s wrangler login, so nothing goes to GitHub.',
    )
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

/** Step 6: the app's own secrets, through the kit's push-secrets script. */
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
    // Before the secrets: `wrangler secret put` on a missing Worker makes an empty placeholder.
    log('\n3. The first test deploy')
    const first = await firstTestDeploy(deps, options, log, resources.test)
    log('\n4. GitHub Actions')
    await github(deps, options, log, chosen)
    log('\n5. App secrets')
    await secrets(deps, options, log)
    log('\n6. Zone security settings')
    await zone(deps, options, log, resources)
    log('\n7. Protecting the test and preview URLs')
    await protection(deps, options, log, resources, chosen, first === 'planned')
    log('\n8. Protecting production')
    await productionProtection(deps, options, log, readResources(deps.readText('wrangler.jsonc')), chosen)
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
