// Bundle budget guard. Run after `pnpm build`: `pnpm check:budgets` (add `--json` for the table).
//
// Pages are server-rendered, so this serves the build (`vite preview`, the same workerd runtime as
// production), fetches each page's real HTML, and measures what that HTML makes a browser fetch
// up front, compressed like a CDN serves it (gzip -9 and brotli 11). It exits 1 over any budget:
//   - initial JS per page: the module entry + modulepreloads + everything they import statically;
//   - route JS per page: the part of that which is not the app entry (the page's own chunks);
//   - CSS per page: the stylesheets it links;
//   - each lazy feature: its chunk plus what only it pulls in (Clerk loads only when keys are set).
// Budgets are gzip bytes, set a little above the last measurement so growth fails loudly. Lower
// them when the app shrinks. Raise one only with a reason in the pull request.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  compressedSize,
  htmlEntryChunks,
  htmlStylesheets,
  kb,
  staticClosure,
  sumSizes,
} from './bundle-graph.ts'
import type { Compressed } from './bundle-graph.ts'

// --- budgets (gzip bytes) --------------------------------------------------------------------
/**
 * Each page to check. React 19 + Router + Start client is ~105 KB gz of framework floor, and
 * 150 KB gz is the target for any page. Measured 2026-11-22: `/` 135.6 KB; `/notes` 160.7 KB, of
 * which 25.5 KB is its own chunk, mostly Zod for the form's client-side check (`zod/mini` or a
 * server-only check is the lever if it must shrink).
 */
const PAGES: Record<string, { initialJs: number; routeJs: number; css: number }> = {
  '/': { initialJs: 145 * 1024, routeJs: 5 * 1024, css: 8 * 1024 },
  '/notes': { initialJs: 170 * 1024, routeJs: 30 * 1024, css: 8 * 1024 },
}
/** Lazy chunks: one file-name pattern each (exactly one file must match) and a gzip budget. */
const LAZY: Record<string, { pattern: RegExp; budget: number }> = {
  clerk: { pattern: /^clerk-[\w-]+\.js$/, budget: 40 * 1024 },
}
// ---------------------------------------------------------------------------------------------

const ASSETS = path.resolve('dist/client/assets')
const PORT = Number(process.env.BUDGET_PORT ?? 4391)
const json = process.argv.includes('--json')
const urlArg = process.argv.find((a) => a.startsWith('--url='))?.slice(6)

if (!existsSync(ASSETS)) {
  console.error('dist/client/assets not found. Run `pnpm build` first.')
  process.exit(1)
}

/** Serve the build unless a running server was given with --url=. */
async function withServer<T>(run: (origin: string) => Promise<T>): Promise<T> {
  if (urlArg) return run(urlArg.replace(/\/$/, ''))
  const origin = `http://localhost:${PORT}`
  const answers = await fetch(origin).then(
    () => true,
    () => false,
  )
  if (answers) throw new Error(`Something already answers on port ${PORT}. Set BUDGET_PORT to a free port.`)
  const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
  })
  let exited = false
  server.on('exit', () => (exited = true))
  try {
    for (let i = 0; ; i++) {
      // A server that exited (port taken: --strictPort) must not let us measure someone else's.
      if (exited) throw new Error(`vite preview could not start on port ${PORT}. Set BUDGET_PORT.`)
      try {
        if ((await fetch(origin)).ok) break
      } catch {
        if (i > 120) throw new Error(`vite preview did not answer on ${origin}`)
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    return await run(origin)
  } finally {
    if (process.platform === 'win32') server.kill()
    else process.kill(-server.pid!, 'SIGTERM')
  }
}

const sources = new Map<string, string>()
const read = (file: string) => {
  let s = sources.get(file)
  if (s === undefined) sources.set(file, (s = readFileSync(path.join(ASSETS, file), 'utf8')))
  return s
}
const sizes = new Map<string, Compressed>()
const size = (file: string) => {
  let s = sizes.get(file)
  if (!s) sizes.set(file, (s = compressedSize(readFileSync(path.join(ASSETS, file)))))
  return s
}
const known = new Set(readdirSync(ASSETS))

const report: Record<string, Compressed & { files: number }> = {}
const checks: Array<[string, number, number]> = []
const initialEverywhere = new Set<string>()

await withServer(async (origin) => {
  for (const [page, budget] of Object.entries(PAGES)) {
    const response = await fetch(origin + page, { headers: { accept: 'text/html' } })
    const html = await response.text()
    const roots = htmlEntryChunks(html)
    const css = htmlStylesheets(html)
    const missing = [...roots, ...css].filter((f) => !known.has(f))
    if (roots.length === 0 || missing.length > 0)
      throw new Error(
        `${page}: the served HTML does not match this build (${missing.join(', ') || 'no scripts'}).`,
      )
    const initial = staticClosure(roots, read)
    const entry = new Set(staticClosure(htmlEntryChunks(html, true), read))
    const route = initial.filter((f) => !entry.has(f))
    for (const f of initial) initialEverywhere.add(f)
    for (const [kind, files, limit] of [
      ['initial JS', initial, budget.initialJs],
      ['route JS', route, budget.routeJs],
      ['CSS', css, budget.css],
    ] as const) {
      const total = sumSizes(files.map(size))
      report[`${page} ${kind}`] = { ...total, files: files.length }
      checks.push([`${page} ${kind}`, total.gzip, limit])
    }
  }
})

for (const [name, { pattern, budget }] of Object.entries(LAZY)) {
  const match = [...known].filter((f) => pattern.test(f))
  if (match.length !== 1) {
    console.error(
      `lazy ${name}: expected one chunk matching ${pattern}, found ${match.join(', ') || 'none'}.`,
    )
    process.exit(1)
  }
  const files = staticClosure(match, read).filter((f) => !initialEverywhere.has(f))
  const total = sumSizes(files.map(size))
  report[`lazy ${name}`] = { ...total, files: files.length }
  checks.push([`lazy ${name}`, total.gzip, budget])
}

if (json) console.log(JSON.stringify(report, null, 2))
for (const [label, s] of Object.entries(report)) {
  console.log(
    `  ${label.padEnd(22)} ${kb(s.gzip).padStart(9)} gzip ${kb(s.brotli).padStart(9)} br ${kb(s.raw).padStart(9)} raw (${s.files} files)`,
  )
}
let failed = false
for (const [label, actual, budget] of checks) {
  const ok = actual <= budget
  failed ||= !ok
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${kb(actual)} / ${kb(budget)} gzip`)
}
if (failed) {
  console.error('\nBundle budget exceeded. Find the cause before raising a budget (see the stack skill).')
  process.exit(1)
}
