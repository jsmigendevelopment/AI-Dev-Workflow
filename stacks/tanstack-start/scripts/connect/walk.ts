// The interactive part: one provider at a time, its steps, the page, then each value it fills.
// Every write needs its own yes, and production needs a separate yes before its value is asked.
import { type Group, type Place, storedName } from './places.ts'
import { looksSecret, type Provider, type Section, shapeProblem, type VarSpec } from './providers.ts'
import { store } from './store.ts'
import { openUrl } from './terminal.ts'
import type { Context } from './types.ts'

const STALE_DAYS = 90

/** One value still to set: the places in its group that don't have it yet. */
export interface Todo {
  name: string
  spec: VarSpec
  group: Group
  places: Place[]
  /** Places whose status couldn't be read: saving there may replace a value. */
  unknown: Place[]
}

function showSection(ctx: Context, provider: Provider, section: Section) {
  const { say } = ctx
  say(`\n  ${section.heading}`)
  section.steps.forEach((step, i) => {
    say(`  ${i + 1}. ${step.text}${step.unverified ? ' (not verified)' : ''}`)
    for (const line of step.copy) say(`       ${line}`)
  })
  if (section.done) say(`  When it worked: ${section.done}`)
  say(`  Full walkthrough: .agents/skills/secrets/providers/${provider.id}.md`)
}

function showProvider(ctx: Context, provider: Provider, index: number, total: number) {
  ctx.say(`\n── ${provider.title} (${index} of ${total})`)
  if (!provider.lastChecked) return
  const days = (ctx.now.getTime() - Date.parse(provider.lastChecked)) / 86_400_000
  if (days > STALE_DAYS)
    ctx.say(`These steps were last checked on ${provider.lastChecked}. Screens may have moved.`)
}

async function askValue(ctx: Context, todo: Todo): Promise<string | null> {
  const where = todo.group.name
  const pem = (todo.spec.shape?.prefix ?? []).some((p) => p.startsWith('-----BEGIN '))
  for (let attempt = 1; attempt <= 3; attempt++) {
    const value = await ctx.term.read(
      `  Paste ${todo.name} for ${where} (hidden as you type or paste; Enter alone skips): `,
      'hidden',
      pem,
    )
    const trimmed = (value ?? '').trim()
    if (trimmed === '') return null
    // Every answer is read hidden; a public one is shown afterwards, unless it looks like a key.
    if (!todo.spec.secret && looksSecret(trimmed, todo.spec.shape, ctx.secretPrefixes)) {
      ctx.say(`  That looks like a secret key, not ${todo.name}. Nothing was saved.`)
      continue
    }
    const problem = shapeProblem(todo.name, trimmed, todo.spec.shape, where)
    if (!problem) {
      if (!todo.spec.secret) ctx.say(`  You entered: ${trimmed}`)
      return trimmed
    }
    ctx.say(`  That doesn't look right: ${problem} Nothing was saved.`)
  }
  ctx.say(`  Skipped ${todo.name} after three tries.`)
  return null
}

/** The yes/no question for one destination, naming the GitHub repository it goes to. */
function saveQuestion(ctx: Context, todo: Todo, place: Place): string {
  const target =
    place.kind === 'github'
      ? `${place.secret ? 'GitHub secret' : 'GitHub variable'} ${place.prefix ? `${storedName(place, todo.name)} ` : ''}${place.env ? `in env \`${place.env}\`` : 'at repository level'} of ${ctx.repo ?? '(unknown repository)'}`
      : place.label
  const unsure = todo.unknown.includes(place)
    ? " (couldn't check whether it's already set; this may replace it)"
    : ''
  return `  Set ${todo.name} as ${target}${unsure}?`
}

async function productionOk(ctx: Context, name: string): Promise<boolean> {
  ctx.say(
    `  Production is on the always-stop list: set it only if you, the owner, want production changed now.`,
  )
  ctx.say(`  Use the production (live) value, not the test one.`)
  return ctx.term.confirm(`  Set ${name} for production now?`)
}

async function setTodo(ctx: Context, todo: Todo) {
  const label = todo.places.map((p) => p.label).join(', ')
  ctx.say(`\n  ${todo.name}${todo.spec.secret ? ' (secret)' : ''} → ${label}`)
  if (todo.group.name === 'production' && !(await productionOk(ctx, todo.name))) {
    ctx.result.skipped.push(`${todo.name} (production)`)
    return
  }
  const value = await askValue(ctx, todo)
  if (value === null) {
    ctx.result.skipped.push(`${todo.name} (${todo.group.name})`)
    return
  }
  for (const place of todo.places) {
    if (!(await ctx.term.confirm(saveQuestion(ctx, todo, place)))) {
      ctx.result.skipped.push(`${todo.name} → ${place.label}`)
      continue
    }
    const problem = store(place, todo.name, value, ctx)
    ctx.status.forget(place)
    if (problem) {
      ctx.say(`  ✗ ${todo.name} → ${place.label}: ${problem}`)
      ctx.result.failed.push(`${todo.name} → ${place.label}`)
    } else {
      ctx.say(`  ✓ ${todo.name} → ${place.label}`)
      ctx.result.stored.push(`${todo.name} → ${place.label}`)
    }
  }
}

/** Walks each provider that has something to set, in order, one walkthrough section at a time. */
export async function walk(ctx: Context, plan: Array<{ provider: Provider; todos: Todo[] }>) {
  for (const [i, { provider, todos }] of plan.entries()) {
    showProvider(ctx, provider, i + 1, plan.length)
    let shown: Section | undefined
    for (const todo of todos) {
      const section = provider.sections[todo.name]!
      const newSteps = section.heading !== shown?.heading
      if (newSteps || section.url !== shown?.url) {
        if (newSteps) showSection(ctx, provider, section)
        shown = section
        if (await ctx.term.confirm(`  Open ${section.url} in your browser?`))
          if (!openUrl(section.url, ctx.platform, ctx.env))
            ctx.say(`  Couldn't open a browser. Open it yourself: ${section.url}`)
      }
      await setTodo(ctx, todo)
    }
  }
}
