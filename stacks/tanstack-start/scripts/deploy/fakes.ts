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
  /** The pull request as GitHub's REST API answers it. */
  pr: { headSha: string; fork: boolean; labels: string[] }
  /** Comments on the pull request: `[login, body]`. */
  comments: [string, string][]
  /** Files the pull request changes under migrations/. */
  migrations: string[]
  /** Workers on the account (`wrangler versions list --name`). */
  workers: string[]
  /** The step that fails: a command line prefix such as `pnpm build` or `wrangler deploy`. */
  failing?: string
  smokePasses: boolean
  /** The status each try of the preview check gets; the last one repeats. */
  answers: number[]
  /** Values in the shell or .env.cloudflare.local. */
  local: Record<string, string>
  files: Record<string, string>
}

export const freshPlace = (over: Partial<Place> = {}): Place => ({
  branch: 'main',
  dirty: false,
  head: HEAD,
  pr: { headSha: HEAD, fork: false, labels: [] },
  comments: [],
  migrations: [],
  workers: ['app-test', 'app-production'],
  smokePasses: true,
  answers: [200],
  local: {},
  files: { 'wrangler.jsonc': PACK_CONFIG },
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

/** The local checkout: its branch, head, changes and the pull request's migrations. */
function checkout(place: Place, args: string[]): CommandResult {
  if (args[0] === 'rev-parse')
    return ok(args.includes('--abbrev-ref') ? `${place.branch}\n` : `${place.head}\n`)
  if (args[0] === 'status') return ok(place.dirty ? ' M src/a.ts\n' : '')
  if (args[0] === 'diff') return ok(place.migrations.join('\n'))
  return ok()
}

function wrangler(place: Place, args: string[]): CommandResult {
  const cmd = args.join(' ')
  if (args[0] === 'versions' && args[1] === 'list')
    return place.workers.includes(args[3]!)
      ? ok('[]')
      : fail('✘ [ERROR] This Worker does not exist on your account. [code: 10007]')
  if (args[0] === 'versions' && args[1] === 'upload')
    return ok(
      `Uploaded app-test\nVersion Preview URL: https://v1-app-test.ann.workers.dev\nAlias URL: https://${args[3]}-app-test.ann.workers.dev\n`,
    )
  if (cmd.startsWith('d1 time-travel info')) return ok('⛅️ wrangler\n{\n  "bookmark": "bm-42"\n}')
  if (args[0] === 'deploy') return ok('Uploaded\nDeployed triggers\n  https://app-x.ann.workers.dev\n')
  return ok()
}

/** Fakes for git, gh, pnpm, wrangler, the site and the files, over one mutable place. */
export function fakes(place: Place) {
  const calls: string[] = []
  const lines: string[] = []
  const tries: Record<string, string>[] = []
  const failing = (l: string) => place.failing !== undefined && l.includes(place.failing)
  const deps: DeployDeps = {
    run(cmd, args, env) {
      const l = line(cmd, args, env)
      calls.push(l)
      if (failing(l)) return Promise.resolve(fail(`${place.failing} broke`))
      if (cmd === 'gh') return Promise.resolve(github(place, args))
      if (cmd === 'git') return Promise.resolve(checkout(place, args))
      if (cmd === 'pnpm' && args[0] === 'build') place.files['.wrangler/deploy/config.json'] = '{}'
      if (cmd === 'pnpm' && args[0]?.startsWith('test:'))
        return Promise.resolve(
          place.smokePasses ? ok('12 passed') : fail('1 failed\n  home page answers 500'),
        )
      return Promise.resolve(ok())
    },
    wrangler(args, env) {
      const l = line('wrangler', args, env)
      calls.push(l)
      return Promise.resolve(failing(l) ? fail(`${place.failing} broke`) : wrangler(place, args))
    },
    status(_url, headers) {
      tries.push(headers)
      return Promise.resolve(place.answers[Math.min(tries.length, place.answers.length) - 1]!)
    },
    local: (name) => place.local[name],
    readText: (path) => place.files[path]!,
    exists: (path) => path in place.files,
    remove: (path) => void delete place.files[path],
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
