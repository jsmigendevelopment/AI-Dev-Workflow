// `pnpm connect`: finds the providers this app needs, shows what's set (by name only), then
// walks the missing ones. Every side effect goes through `Io`, so the tests use fakes.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { type Folders, groupsFor, type Place, statusReader } from './places.ts'
import { parseProviders, type Provider, secretPrefixes } from './providers.ts'
import { githubRepo } from './repo.ts'
import { readSecretsMode, SECRETS_MODE_VARIABLE } from './secrets-mode.ts'
import { runner } from './shell.ts'
import { type Output, safeText, Stopped, terminal, type TtyInput } from './terminal.ts'
import type { Context } from './types.ts'
import { type Todo, walk } from './walk.ts'

export interface Io {
  stdin: TtyInput
  stdout: Output
  env: Record<string, string | undefined>
  cwd: string
  platform: NodeJS.Platform
  now?: Date
}

const USAGE = `Usage: pnpm connect [provider] [--force] [--dry-run]
  (no provider)  every provider this app needs, from .env.example and the workflows
  <provider>     just that one, for example: pnpm connect clerk
  --force        ask again for values that are already set
  --dry-run      show what's set and what it would ask, by name only; changes nothing
Run it in your own terminal: values are typed with hidden input and never shown.`

const REDIRECT = '.wrangler/deploy/config.json'

function findRoot(start: string): string {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.agents')) || existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return start
  }
}

/** Every name the app reads: .env.example lines, and secrets.X / vars.X in the workflows. */
export function neededNames(folders: Folders): Set<string> {
  const names = new Set<string>()
  for (const dir of new Set([folders.app, folders.root])) {
    const example = join(dir, '.env.example')
    if (existsSync(example))
      for (const m of readFileSync(example, 'utf8').matchAll(/^\s*([A-Z][A-Z0-9_]*)=/gm)) names.add(m[1]!)
    const workflows = join(dir, '.github', 'workflows')
    if (existsSync(workflows))
      for (const file of readdirSync(workflows).filter((f) => /\.ya?ml$/.test(f)))
        for (const m of readFileSync(join(workflows, file), 'utf8').matchAll(
          /\b(?:secrets|vars)\.([A-Z][A-Z0-9_]*)/g,
        ))
          names.add(m[1]!)
  }
  names.delete('GITHUB_TOKEN')
  names.delete(SECRETS_MODE_VARIABLE) // setup-github's switch, not a value to ask for
  // A workflow reads TEST_X or PRODUCTION_X in repository mode: those are X under another name.
  for (const name of names) {
    const base = name.replace(/^(?:TEST|PRODUCTION)_/, '')
    if (base !== name && names.has(base)) names.delete(name)
  }
  return names
}

function parseArgs(args: string[]) {
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  const at = args.indexOf('--providers')
  const providersDir = at >= 0 ? args[at + 1] : undefined
  const words = args.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1))
  const known = ['--force', '--dry-run', '--providers', '--help']
  const bad = [...flags].find((f) => !known.includes(f)) ?? (words.length > 1 ? words[1] : undefined)
  return {
    force: flags.has('--force'),
    dryRun: flags.has('--dry-run'),
    help: flags.has('--help'),
    only: words[0],
    providersDir,
    bad,
  }
}

function loadProviders(dir: string): Provider[] {
  return parseProviders(
    readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ id: f.slice(0, -3), markdown: readFileSync(join(dir, f), 'utf8') })),
  )
}

/** The todos for each provider, and one status line per variable. */
function planFor(ctx: Context, providers: Provider[], needed: Set<string> | null, force: boolean) {
  const plan: Array<{ provider: Provider; todos: Todo[] }> = []
  for (const provider of providers) {
    const todos: Todo[] = []
    const warnings: string[] = []
    ctx.say(`${provider.title}`)
    for (const [name, spec] of Object.entries(provider.vars)) {
      if (needed && !needed.has(name)) continue
      const words: string[] = []
      for (const group of groupsFor(spec, ctx.secretsMode)) {
        const unknown: Place[] = []
        const places = group.places.filter((place) => {
          const set = ctx.status.isSet(name, place)
          words.push(`${place.label} ${set === undefined ? '?' : set ? '✓' : '✗'}`)
          if (set === undefined) unknown.push(place)
          return force || set !== true
        })
        if (places.length) todos.push({ name, spec, group, places, unknown })
        if (unknown.length)
          warnings.push(
            `  ⚠ ${name}: couldn't check whether it's already set in ${unknown.map((p) => p.label).join(', ')}.`,
          )
      }
      ctx.say(`  ${name}: ${words.join(', ')}`)
      for (const w of warnings.splice(0)) ctx.say(w)
    }
    if (todos.length) plan.push({ provider, todos })
  }
  return plan
}

function dryRunReport(ctx: Context, plan: Array<{ provider: Provider; todos: Todo[] }>) {
  if (!plan.length) return ctx.say('\nNothing to set.')
  ctx.say('\nDry run: nothing is asked, written or pushed. A real run would ask for:')
  for (const { provider, todos } of plan)
    for (const t of todos)
      ctx.say(
        `  ${provider.title}: ${t.name} for ${t.group.name} → ${t.places.map((p) => p.label).join(', ')}` +
          (t.group.name === 'production' ? ' (only after a separate yes for production)' : ''),
      )
}

function choose(all: Provider[], only: string | undefined, needed: Set<string>, say: (l: string) => void) {
  if (only) {
    const one = all.find((p) => p.id === only)
    if (!one) say(`No provider called "${only}". Known: ${all.map((p) => p.id).join(', ')}`)
    return one ? { providers: [one], needed: null } : null
  }
  const providers = all.filter((p) => Object.keys(p.vars).some((n) => needed.has(n)))
  const covered = new Set(providers.flatMap((p) => Object.keys(p.vars)))
  const rest = [...needed].filter((n) => !covered.has(n))
  if (rest.length)
    say(`Not asked here (setup-cloudflare, wrangler.jsonc vars, or by hand): ${rest.join(', ')}\n`)
  return { providers, needed }
}

function removeRedirect(cwd: string, dryRun: boolean, say: (line: string) => void) {
  if (!existsSync(join(cwd, REDIRECT))) return
  // A build leaves this redirect; wrangler would follow it to the wrong config for --env.
  say(
    `${dryRun ? 'Would remove' : 'Removing'} ${REDIRECT} (a build artefact) so secrets reach the right Worker.`,
  )
  if (!dryRun) rmSync(join(cwd, REDIRECT), { force: true })
}

async function walkAndReport(ctx: Context, plan: Array<{ provider: Provider; todos: Todo[] }>) {
  try {
    await walk(ctx, plan)
  } catch (error) {
    if (!(error instanceof Stopped)) throw error
    ctx.say('\nStopped. Whatever was saved before this stays saved.')
    return 130
  }
  const { stored, skipped, failed } = ctx.result
  ctx.say(`\nDone. Saved ${stored.length}, skipped ${skipped.length}, failed ${failed.length}.`)
  for (const line of failed) ctx.say(`  failed: ${line}`)
  if (skipped.length) ctx.say('Run pnpm connect again any time: it asks only for what is still missing.')
  return failed.length ? 1 : 0
}

/** Which GitHub repository values go to, and under which names. */
function sayGithub({ repo, secretsMode, say }: Context) {
  say(
    repo
      ? `GitHub repository: ${repo} (from the origin remote).`
      : "GitHub: the origin remote isn't on github.com, so GitHub values can't be set here.",
  )
  if (secretsMode === 'repository')
    say(
      'SECRETS_MODE is "repository" (GitHub Free, private repo): values go to repository secrets named TEST_<name> and PRODUCTION_<name>.',
    )
}

/** The whole command. Returns the exit code. */
export async function connect(args: string[], io: Io): Promise<number> {
  // Every line goes through safeText: provider files can't put escape sequences on the screen.
  const say = (line: string) => void io.stdout.write(`${safeText(line)}\n`)
  const opts = parseArgs(args)
  if (opts.help || opts.bad)
    return (say(opts.bad ? `Unknown: ${opts.bad}\n${USAGE}` : USAGE), opts.bad ? 2 : 0)
  if (!opts.dryRun && !io.stdin.isTTY) {
    say('pnpm connect asks for keys with hidden input, so run it in your own terminal, not through an agent.')
    say('To see what is set, by name only: pnpm connect --dry-run')
    return 2
  }
  const folders = { app: io.cwd, root: findRoot(io.cwd) }
  const dir = opts.providersDir ?? join(folders.root, '.agents', 'skills', 'secrets', 'providers')
  if (!existsSync(dir))
    return (say(`No provider walkthroughs at ${dir}. Install the kit first (npx onrails init).`), 2)
  let providers: Provider[]
  try {
    providers = loadProviders(dir)
  } catch (error) {
    // A malformed or unsafe block stops the run before anything is asked.
    return (say(`Stopped: ${(error as Error).message}`), 2)
  }
  const picked = choose(providers, opts.only, neededNames(folders), say)
  if (!picked) return 2
  removeRedirect(io.cwd, opts.dryRun, say)
  const run = runner(io.env, io.cwd, io.platform)
  const repo = githubRepo(folders.root, run)
  const ctx: Context = {
    folders,
    run,
    repo,
    secretsMode: readSecretsMode(run, repo),
    secretPrefixes: secretPrefixes(providers),
    platform: io.platform,
    env: io.env,
    now: io.now ?? new Date(),
    say,
    term: terminal(io.stdin, io.stdout),
    status: statusReader(folders, run, repo),
    result: { stored: [], skipped: [], failed: [] },
  }
  sayGithub(ctx)
  say('What is set, by name only (✓ set, ✗ missing, ? could not check):')
  const plan = planFor(ctx, picked.providers, picked.needed, opts.force)
  if (opts.dryRun) return (dryRunReport(ctx, plan), 0)
  if (!plan.length) return (say('\nEverything is set. Use --force to set a value again.'), 0)
  return walkAndReport(ctx, plan)
}
