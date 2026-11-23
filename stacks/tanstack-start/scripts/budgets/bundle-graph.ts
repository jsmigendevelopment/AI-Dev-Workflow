// Pure helpers for the bundle budget check: read the built client output, follow static imports
// between chunks, and sum compressed sizes. No Vite or Rollup dependency: it works on
// `dist/client` exactly as it ships. Used by `check-budgets.ts` (`pnpm check:budgets`).
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

/** Static imports between built chunks (`import "./a.js"`, `import { x } from "./b.js"`). */
const STATIC_IMPORT = /\bimport\s*(?:[\w*{}\s,$]+?\s*from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g
/** Dynamic imports (`import("./c.js")`): lazy chunks, not part of the initial load. */
const DYNAMIC_IMPORT = /\bimport\(\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]\s*\)/g

/** Chunk file names (relative to the assets folder; all chunks share one folder) in `source`. */
function collect(pattern: RegExp, source: string): string[] {
  const out = new Set<string>()
  for (const match of source.matchAll(pattern)) {
    const spec = match[1]
    if (spec) out.add(spec.replace(/^\.\//, ''))
  }
  return [...out]
}

export function staticImports(source: string): string[] {
  return collect(STATIC_IMPORT, source)
}

export function dynamicImports(source: string): string[] {
  return collect(DYNAMIC_IMPORT, source)
}

/**
 * `/assets/x.js` files the HTML loads up front: module scripts and modulepreloads, or with
 * `scriptsOnly` the module scripts alone (the app entry, without the route's chunks).
 */
export function htmlEntryChunks(html: string, scriptsOnly = false): string[] {
  const out = new Set<string>()
  const tag = /<(?:script|link)\b[^>]*>/g
  for (const [element] of html.matchAll(tag)) {
    const isModuleScript = element.startsWith('<script') && /type="module"/.test(element)
    const isPreload = element.startsWith('<link') && /rel="modulepreload"/.test(element)
    if (!isModuleScript && (scriptsOnly || !isPreload)) continue
    const url = /(?:src|href)="\/assets\/([^"]+\.js)"/.exec(element)?.[1]
    if (url) out.add(url)
  }
  return [...out]
}

/** `/assets/x.css` stylesheets the HTML links. */
export function htmlStylesheets(html: string): string[] {
  const out = new Set<string>()
  for (const [element] of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)) {
    const url = /href="\/assets\/([^"]+\.css)"/.exec(element)?.[1]
    if (url) out.add(url)
  }
  return [...out]
}

/** Every chunk reachable from `roots` through static imports only (the roots included). */
export function staticClosure(roots: Iterable<string>, read: (file: string) => string): string[] {
  const seen = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined || seen.has(file)) continue
    seen.add(file)
    queue.push(...staticImports(read(file)))
  }
  return [...seen].toSorted()
}

export interface Compressed {
  raw: number
  gzip: number
  brotli: number
}

/** Sizes like a CDN would serve them: gzip -9 and brotli quality 11. */
export function compressedSize(bytes: Uint8Array): Compressed {
  return {
    raw: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
    brotli: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  }
}

export function sumSizes(sizes: Iterable<Compressed>): Compressed {
  const total = { raw: 0, gzip: 0, brotli: 0 }
  for (const s of sizes) {
    total.raw += s.raw
    total.gzip += s.gzip
    total.brotli += s.brotli
  }
  return total
}

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`
