// The password gate (test and previews only): one random SITE_PASSWORD, saved in
// .env.cloudflare.local before the test Worker gets it, so no password exists that nobody holds.
import { ghSecret, type GithubWrites, saveForDeploys } from './access.ts'
import type { Deps, Log, Options } from './deps.ts'
import { LOCAL_FILE } from './local-env.ts'
import { firstJson } from './wrangler-config.ts'

/** Sets SITE_PASSWORD on the test Worker unless it has one. False when it couldn't. */
export async function protectWithPassword(
  deps: Deps,
  options: Options,
  log: Log,
  github: GithubWrites,
): Promise<boolean> {
  const listed = await deps.wrangler(['secret', 'list', '--env', 'test', '--format', 'json'])
  const names =
    listed.status === 0 ? (firstJson<{ name: string }[]>(listed.stdout) ?? []).map((s) => s.name) : []
  if (names.includes('SITE_PASSWORD') && !options.newPassword) {
    log(
      `exists  SITE_PASSWORD on the test Worker (the deploys read it as TEST_SITE_PASSWORD in ${LOCAL_FILE}; pass --new-password to replace it)`,
    )
    return true
  }
  const problem = deps.localProblem(!options.dryRun)
  if (problem)
    return (
      log(`  ${problem} ${options.dryRun ? 'A real run makes no password.' : 'No password was made.'}`),
      false
    )
  const where = `the test Worker and ${LOCAL_FILE} as TEST_SITE_PASSWORD${github.actions ? ', and in the GitHub environments test and preview' : ''}`
  if (options.dryRun) {
    log(
      `would make a random SITE_PASSWORD (never the repo name) and save it on ${where}. It is never printed.`,
    )
    return true
  }
  const password = deps.randomSecret()
  const failed = saveForDeploys(deps, log, 'TEST_', { SITE_PASSWORD: password })
  if (failed)
    throw new Error(
      `${failed}, so no password was set. Make sure you can write ${LOCAL_FILE}, then run this again.`,
    )
  const put = await deps.wrangler(['secret', 'put', 'SITE_PASSWORD', '--env', 'test'], password)
  if (put.status !== 0) {
    log(
      `  could not set SITE_PASSWORD on the test Worker: ${(put.stderr || put.stdout).trim().split('\n').at(-1)}`,
    )
    return false
  }
  log('  set SITE_PASSWORD on the test Worker (previews use it too)')
  if (github.gh) await ghSecret(deps, log, 'SITE_PASSWORD', password, ['test', 'preview'])
  else if (github.actions)
    log(
      `  GitHub CLI not signed in: set SITE_PASSWORD in the GitHub environments test and preview by hand, from ${LOCAL_FILE}.`,
    )
  log(`  The person opens ${LOCAL_FILE} to read the password (TEST_SITE_PASSWORD). It is never printed.`)
  return true
}
