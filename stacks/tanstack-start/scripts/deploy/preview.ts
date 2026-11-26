// `pnpm deploy:preview <pr>`: a preview of one pull request, run from the session before review.
// A new version of the TEST Worker under its own alias (https://pr-<n>-<test worker>.<subdomain>.
// workers.dev), uploaded, not deployed: the test site's live version doesn't change. It uses the
// test database and test keys, never production's, and never migrates. One comment on the pull
// request holds the link, updated on each run. Skipped for forks and the `lane:tiny` label. The
// deploy output is masked.
import { gateHeaders } from '../../e2e/gate-headers.ts'
import { workerExists } from '../cloudflare/first-deploy.ts'
import type { DeployDeps } from './deps.ts'
import {
  clearRedirect,
  environment,
  gateEnv,
  masking,
  step,
  Stop,
  targetEnv,
  workersDevUrl,
} from './shared.ts'

const MARKER = '<!-- preview-url -->'
const TEST = targetEnv('test')

interface PullRequest {
  head: { sha: string; repo: { full_name: string } | null }
  base: { sha: string; repo: { full_name: string } }
  labels: { name: string }[]
}

async function readPullRequest(deps: DeployDeps, pr: string): Promise<PullRequest> {
  const out = await step(
    deps,
    `read pull request #${pr}`,
    deps.run('gh', ['api', `repos/{owner}/{repo}/pulls/${pr}`]),
  )
  return JSON.parse(out) as PullRequest
}

/** Asks up to six times, ten seconds apart: a new version can take a moment to answer. */
async function answers(deps: DeployDeps, url: string, headers: Record<string, string>) {
  let status = 0
  for (let i = 0; i < 6; i++) {
    if (i) await deps.sleep(10_000)
    status = await deps.status(`${url}/`, headers)
    if (status === 200) return
  }
  throw new Stop(
    `the preview ${url} answered ${status}, not 200. With protection on, check the TEST_ values it sends.`,
  )
}

async function addsMigration(deps: DeployDeps, base: string) {
  const diff = await deps.run('git', [
    'diff',
    '--no-renames',
    '--name-only',
    `${base}...HEAD`,
    '--',
    'migrations',
  ])
  return diff.status === 0 ? Boolean(diff.stdout.trim()) : null
}

function commentBody(url: string, sha: string, migration: boolean | null) {
  const lines = [
    MARKER,
    `**Preview:** ${url}`,
    `Commit ${sha.slice(0, 7)}. Runs on the **test** database and test keys.`,
  ]
  if (migration)
    lines.push(
      'This pull request adds a migration. Previews never migrate the shared test database, so pages that need the new schema fail here until it is merged.',
    )
  if (migration === null) lines.push('Could not tell whether this pull request adds a migration.')
  return lines.join('\n')
}

/** One comment per pull request, by the signed-in account, updated in place. */
async function postComment(deps: DeployDeps, pr: string, body: string) {
  const failed = () =>
    deps.log(`Could not post the comment on #${pr}. Post this on the pull request:\n${body}`)
  const me = (await deps.run('gh', ['api', 'user', '--jq', '.login'])).stdout.trim()
  const mine = `.[] | select(.user.login == ${JSON.stringify(me)} and (.body | startswith(${JSON.stringify(MARKER)}))) | .id`
  const found = await deps.run('gh', [
    'api',
    '--paginate',
    `repos/{owner}/{repo}/issues/${pr}/comments`,
    '--jq',
    mine,
  ])
  if (!me || found.status !== 0) return failed()
  const id = found.stdout.trim().split('\n')[0]
  const [method, path] = id
    ? ['PATCH', `repos/{owner}/{repo}/issues/comments/${id}`]
    : ['POST', `repos/{owner}/{repo}/issues/${pr}/comments`]
  const written = await deps.run('gh', ['api', '-X', method, path, '-f', `body=${body}`])
  if (written.status !== 0) return failed()
  deps.log(`- ${id ? 'updated' : 'posted'} the preview comment on #${pr}`)
}

async function preview(deps: DeployDeps, pr: string) {
  if (!/^\d+$/.test(pr)) throw new Stop('give the pull request number: pnpm deploy:preview <n>')
  const info = await readPullRequest(deps, pr)
  if (info.head.repo?.full_name !== info.base.repo.full_name)
    return deps.log(`Skipped: #${pr} comes from a fork, and a preview would run its code with the test keys.`)
  if (info.labels.some((l) => l.name === 'lane:tiny')) return deps.log(`Skipped: #${pr} is lane:tiny.`)
  const head = (await deps.run('git', ['rev-parse', 'HEAD'])).stdout.trim()
  if (head !== info.head.sha)
    throw new Stop(
      `this checkout is at ${head.slice(0, 7)} and #${pr} is at ${info.head.sha.slice(0, 7)}. ` +
        `Preview its exact head: git fetch origin pull/${pr}/head && git switch --detach FETCH_HEAD`,
    )
  const test = environment(deps, 'test')
  const gate = gateEnv(deps, 'test', test.vars)
  const exists = await workerExists(deps, test.worker).catch((error: unknown) => {
    throw new Stop(error instanceof Error ? error.message : String(error))
  })
  if (!exists)
    throw new Stop(
      `the test Worker ${test.worker} doesn't exist yet, so there is nothing to preview on. Make it once: ` +
        'node scripts/setup-cloudflare.mjs (it deploys the test Worker), or pnpm deploy:test from main.',
    )
  try {
    await step(deps, 'build for test', deps.run('pnpm', ['build'], TEST))
    const upload = [
      'versions',
      'upload',
      '--preview-alias',
      `pr-${pr}`,
      '--message',
      `PR #${pr} ${head.slice(0, 7)}`,
    ]
    const out = await step(deps, 'upload the preview', deps.wrangler(upload, TEST))
    const url = /Alias URL: (https:\/\/\S+)/.exec(out)?.[1] ?? workersDevUrl(out)
    if (!url) throw new Stop('no preview URL in the upload output.')
    await answers(deps, url, gateHeaders(gate))
    await postComment(deps, pr, commentBody(url, head, await addsMigration(deps, info.base.sha)))
    deps.log(`Preview of #${pr}: ${url}`)
  } finally {
    clearRedirect(deps)
  }
}

export const deployPreview = (deps: DeployDeps, pr: string) => masking(deps, (masked) => preview(masked, pr))
