// A fake checkout, GitHub, wrangler and site for the deploy tests: a `Place` the fakes read and change.
import type { CommandResult } from '../cloudflare/deps'
import { PACK_CONFIG } from '../cloudflare/fakes'
import type { ChildEnv, DeployDeps } from './deps'
import { Stop } from './shared'

export const HEAD = 'abc1234def5678abc1234def5678abc1234def56'
export const BASE = '0000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

export interface Place {
  branch: string
  dirty: boolean
  head: string
  /** GitHub's main after `git fetch` (refs/remotes/origin/main). */
  remoteMain: string
  /** The checkout has commits GitHub's main doesn't (so it isn't just behind). */
  localOnly: boolean
  /** The pull request as GitHub's REST API answers it. */
  pr: { headSha: string; fork: boolean; labels: string[] }
  /** Comments on the pull request: `[login, body]`. */
  comments: [string, string][]
  /** Files the pull request changes under migrations/. */
  migrations: string[]
  /** Workers on the account (`wrangler versions list` and `deployments list --name`). */
  workers: string[]
  /** The step that fails: a command line prefix such as `pnpm build` or `wrangler deploy`. */
  failing?: string
  /** The step that crashes (its promise rejects), the same way. */
  crashing?: string
  /** What `wrangler deploy` prints. */
  deployPrints: string
  /** `wrangler deploy` makes the new version live, then fails setting routes, as wrangler 4.164 can. */
  partWay: boolean
  /** The newest deployment's message (`wrangler deployments list`); none listed when undefined. */
  live?: string
  /** The newest deployment's id number: each deploy or rollback that goes live makes a new one. */
  serial: number
  /** A Worker's first deploy goes live without its message, as wrangler's first-deploy path may. */
  untagged: boolean
  /** `wrangler deployments list` gives no deployment an id. */
  noIds?: boolean
  /** The first `wrangler deployments list` fails; later ones answer. */
  firstListFails: boolean
  /** The pnpm on PATH (`pnpm --version`). */
  pnpm: string
  /** PIDs of the processes still running. */
  running: number[]
  /** What a failing or crashing command also prints, as a tool that echoes its environment would. */
  echo: string
  smokePasses: boolean
  /** The status each try of the preview check gets; the last one repeats. */
  answers: number[]
  /** Values in the shell or .env.cloudflare.local. */
  local: Record<string, string>
  /** What `known()` lists, when it isn't `local` (the names masking sees). */
  listed?: [string, string][]
  files: Record<string, string>
}

export const freshPlace = (over: Partial<Place> = {}): Place => ({
  branch: 'main',
  dirty: false,
  head: HEAD,
  remoteMain: HEAD,
  localOnly: false,
  pr: { headSha: HEAD, fork: false, labels: [] },
  comments: [],
  migrations: [],
  workers: ['app-test', 'app-production'],
  deployPrints: 'Uploaded\nDeployed triggers\n  https://app-x.ann.workers.dev\n',
  partWay: false,
  live: 'main 0000000',
  serial: 2,
  untagged: false,
  firstListFails: false,
  pnpm: '12.21.0',
  running: [],
  echo: '',
  smokePasses: true,
  answers: [200],
  local: {},
  files: { 'wrangler.jsonc': PACK_CONFIG, 'package.json': '{ "packageManager": "pnpm@12.21.0" }' },
  ...over,
})

/** wrangler.jsonc with these vars in one environment's block. */
export const withVars = (env: 'test' | 'production', vars: string) =>
  PACK_CONFIG.replace(
    env === 'test'
      ? '"vars": { "LAUNCHED": "true", "SITE_PROTECTION": "none" }'
      : '"vars": { "LAUNCHED": "false", "SITE_PROTECTION": "none" }',
    `"vars": { ${vars} }`,
  )

const ok = (stdout = ''): CommandResult => ({ status: 0, stdout, stderr: '' })
const fail = (stderr: string): CommandResult => ({ status: 1, stdout: '', stderr })

/** Every command as one line, with the variables it was given first: `CLOUDFLARE_ENV=test pnpm build`. */
const line = (cmd: string, args: string[], env: ChildEnv = {}) =>
  `${Object.entries(env)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v} `)
    .join('')}${cmd} ${args.join(' ')}`

/** A failed smoke test's output, with a request log that shows the headers it sent, as Playwright's can. */
const smokeFailed = (env: ChildEnv = {}) =>
  fail(
    [
      '1 failed',
      '  home page answers 500',
      `  GET / cf-access-client-id: ${env.CF_ACCESS_CLIENT_ID ?? ''}`,
      `  cf-access-client-secret: ${env.CF_ACCESS_CLIENT_SECRET ?? ''} x-site-password: ${env.SITE_PASSWORD ?? ''}`,
    ].join('\n'),
  )

function github(place: Place, args: string[]): CommandResult {
  const path = args.find((a) => a.startsWith('repos/') || a === 'user') ?? ''
  if (path === 'user') return ok('ann\n')
  if (/^repos\/\{owner\}\/\{repo\}\/pulls\/\d+$/.test(path)) {
    const repo = { full_name: 'ann/app' }
    const head = { sha: place.pr.headSha, repo: place.pr.fork ? { full_name: 'stranger/app' } : repo }
    return ok(
      JSON.stringify({ head, base: { sha: BASE, repo }, labels: place.pr.labels.map((name) => ({ name })) }),
    )
  }
  if (path.endsWith('/comments') && !args.includes('-X'))
    return ok(
      place.comments
        .map(([login, body], i) =>
          login === 'ann' && body.startsWith('<!-- preview-url -->') ? `${i + 1}\n` : '',
        )
        .join(''),
    )
  const body = args[args.indexOf('-f') + 1]!.slice('body='.length)
  if (args.includes('PATCH')) place.comments[Number(path.split('/').at(-1)) - 1]![1] = body
  else place.comments.push(['ann', body])
  return ok('{}')
}

/** The local checkout: its branch, head, changes, GitHub's main and the pull request's migrations. */
function checkout(place: Place, args: string[]): CommandResult {
  if (args[0] === 'rev-parse') {
    if (args.includes('--abbrev-ref')) return ok(`${place.branch}\n`)
    if (args.includes('--git-common-dir')) return ok('.git\n')
    return ok(`${args.includes('refs/remotes/origin/main') ? place.remoteMain : place.head}\n`)
  }
  if (args[0] === 'merge-base') return place.localOnly ? fail('') : ok()
  if (args[0] === 'status') return ok(place.dirty ? ' M src/a.ts\n' : '')
  if (args[0] === 'diff') return ok(place.migrations.join('\n'))
  return ok()
}

/** A missing Worker, as wrangler reports it. */
const NO_WORKER = fail('✘ [ERROR] This Worker does not exist on your account. [code: 10007]')

/** `wrangler deployments list --name <worker>`. */
function listDeployments(place: Place, worker: string): CommandResult {
  if (place.firstListFails) {
    place.firstListFails = false
    return fail('✘ [ERROR] A request to the Cloudflare API (/workers/deployments) failed.')
  }
  return place.workers.includes(worker) ? ok(deployments(place)) : NO_WORKER
}

/** A new deployment goes live: a deploy (which creates a missing Worker) or a rollback. */
function goLive(place: Place, worker: string, message: string) {
  const first = !place.workers.includes(worker)
  if (first) place.workers.push(worker)
  place.live = first && place.untagged ? '' : message
  place.serial++
}

function wrangler(place: Place, args: string[], env: ChildEnv = {}): CommandResult {
  const cmd = args.join(' ')
  const worker = `app-${env.CLOUDFLARE_ENV ?? 'test'}`
  if (args[0] === 'versions' && args[1] === 'list')
    return place.workers.includes(args[3]!) ? ok('[]') : NO_WORKER
  if (args[0] === 'versions' && args[1] === 'upload')
    return ok(
      `Uploaded app-test\nVersion Preview URL: https://v1-app-test.ann.workers.dev\nAlias URL: https://${args[3]}-app-test.ann.workers.dev\n`,
    )
  if (cmd.startsWith('d1 time-travel info')) return ok('⛅️ wrangler\n{\n  "bookmark": "bm-42"\n}')
  if (args[0] === 'deployments' && args[1] === 'list') return listDeployments(place, args[3]!)
  const message = args[args.indexOf('--message') + 1]!
  if (args[0] === 'rollback') goLive(place, worker, message)
  if (args[0] !== 'deploy') return ok()
  goLive(place, worker, message)
  return place.partWay
    ? fail('Uploaded app\n✘ [ERROR] A request to the Cloudflare API (/zones/z1/workers/routes) failed.')
    : ok(place.deployPrints)
}

/**
 * `wrangler deployments list --json`: an older deployment, and `live` as the newest, out of order.
 * A deployment with no message (`live` is '') has no annotation.
 */
const deployments = ({ live, serial, noIds }: Place) =>
  JSON.stringify(
    live === undefined
      ? []
      : [
          {
            id: noIds ? undefined : `d${serial}`,
            created_on: `2026-11-02T10:00:${String(serial).padStart(2, '0')}Z`,
            annotations: live ? { 'workers/message': live } : {},
          },
          {
            id: noIds ? undefined : 'd1',
            created_on: '2026-11-01T10:00:00Z',
            annotations: { 'workers/message': 'main 9999999' },
          },
        ],
  )

/** Fakes for git, gh, pnpm, wrangler, the site and the files, over one mutable place. */
export function fakes(place: Place) {
  const calls: string[] = []
  const lines: string[] = []
  const tries: Record<string, string>[] = []
  const matches = (l: string, prefix?: string) => prefix !== undefined && l.includes(prefix)
  /** A failing or crashing step, else undefined so the fake answers normally. */
  const broken = (l: string): Promise<CommandResult> | undefined => {
    if (matches(l, place.crashing))
      return Promise.reject(new Error(`${place.crashing} crashed\n${place.echo}`.trim()))
    if (matches(l, place.failing))
      return Promise.resolve(fail(`${place.failing} broke\n${place.echo}`.trim()))
    return undefined
  }
  const deps: DeployDeps = {
    run(cmd, args, env) {
      const l = line(cmd, args, env)
      calls.push(l)
      const out = broken(l)
      if (out) return out
      if (cmd === 'gh') return Promise.resolve(github(place, args))
      if (cmd === 'git') return Promise.resolve(checkout(place, args))
      if (cmd === 'pnpm' && args[0] === '--version') return Promise.resolve(ok(`${place.pnpm}\n`))
      if (cmd === 'pnpm' && args[0] === 'build') place.files['.wrangler/deploy/config.json'] = '{}'
      if (cmd === 'pnpm' && args[0]?.startsWith('test:'))
        return Promise.resolve(place.smokePasses ? ok('12 passed') : smokeFailed(env))
      return Promise.resolve(ok())
    },
    wrangler(args, env) {
      const l = line('wrangler', args, env)
      calls.push(l)
      return broken(l) ?? Promise.resolve(wrangler(place, args, env))
    },
    status(_url, headers) {
      tries.push(headers)
      return Promise.resolve(place.answers[Math.min(tries.length, place.answers.length) - 1]!)
    },
    local: (name) => place.local[name],
    known: () => place.listed ?? Object.entries(place.local),
    readText: (path) => place.files[path]!,
    readPlain: (path) => place.files[path],
    exists: (path) => path in place.files,
    remove: (path) => void delete place.files[path],
    create(path, text) {
      if (path in place.files) return false
      place.files[path] = text
      return true
    },
    alive: (pid) => place.running.includes(pid),
    pid: 4242,
    sleep: () => Promise.resolve(),
    log: (l) => void lines.push(l),
  }
  return { deps, calls, tries, output: () => lines.join('\n') }
}

/** Runs one deploy over the fakes: the exit code the entry would give, the calls and the output. */
export async function attempt(place: Place, deploy: (deps: DeployDeps) => Promise<unknown>) {
  const f = fakes(place)
  try {
    await deploy(f.deps)
    return { ...f, code: 0, stopped: '' }
  } catch (error) {
    if (!(error instanceof Stop)) throw error
    return { ...f, code: 1, stopped: error.message }
  }
}
