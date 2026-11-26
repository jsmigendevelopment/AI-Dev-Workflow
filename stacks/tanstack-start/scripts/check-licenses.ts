// Licence allow-list: `pnpm check:licenses`, run before merge by `pnpm check:merge`. Fails on any
// installed package whose licence is not on the list, naming the package. Exceptions name the package, the reason and the
// date they were checked. Policy: .agents/skills/dependencies in the kit (permissive only in
// shipped code; no AGPL, SSPL, BUSL, source-available or GPL).
import { execFileSync } from 'node:child_process'

/** Permissive licences, safe in a product that may be closed-source or sold as a service. */
const ALLOWED = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'MIT-0', // MIT without the attribution clause (@csstools/color-helpers, via jsdom in the monorepo)
  'Zlib',
  'Unlicense',
  'CC0-1.0',
  'BSL-1.0',
  'MPL-2.0', // file-level copyleft: fine to use; publish changes you make to its files
  'BlueOak-1.0.0', // permissive (minimatch, graceful-fs and friends)
  'Python-2.0', // permissive (argparse)
  'CC-BY-4.0', // attribution licence for data (caniuse-lite browser data)
])

/** Packages allowed despite their licence: dev tooling only, never in the shipped bundle. */
const DEV_ONLY_EXCEPTIONS: Record<string, string> = {
  // sharp's prebuilt libvips binary, pulled in by miniflare (wrangler's local runtime) for local
  // image bindings. LGPL, dynamically linked, unmodified, and never bundled. Checked 2026-11-22.
  '@img/sharp-libvips-linux-x64': 'LGPL-3.0-or-later, dev-only via miniflare',
  '@img/sharp-libvips-linux-arm64': 'LGPL-3.0-or-later, dev-only via miniflare',
  '@img/sharp-libvips-linuxmusl-x64': 'LGPL-3.0-or-later, dev-only via miniflare',
  '@img/sharp-libvips-linuxmusl-arm64': 'LGPL-3.0-or-later, dev-only via miniflare',
  '@img/sharp-libvips-darwin-arm64': 'LGPL-3.0-or-later, dev-only via miniflare',
  '@img/sharp-libvips-darwin-x64': 'LGPL-3.0-or-later, dev-only via miniflare',
  '@img/sharp-win32-x64': 'Apache-2.0 AND LGPL-3.0-or-later, dev-only via miniflare',
  '@img/sharp-win32-arm64': 'Apache-2.0 AND LGPL-3.0-or-later, dev-only via miniflare',
}

type Listing = Record<string, Array<{ name: string; versions: string[] }>>

const list = (prod: boolean) =>
  JSON.parse(
    execFileSync('pnpm', ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024,
    }),
  ) as Listing

/** `MIT OR Apache-2.0` is fine if any side is; `A AND B` needs both. */
function allowed(expression: string): boolean {
  const clean = expression.replace(/[()]/g, '').trim()
  if (/ OR /i.test(clean)) return clean.split(/ OR /i).some((part) => allowed(part))
  if (/ AND /i.test(clean)) return clean.split(/ AND /i).every((part) => allowed(part))
  return ALLOWED.has(clean)
}

const problems: string[] = []
const prod = list(true)
for (const [licence, packages] of Object.entries(prod))
  if (!allowed(licence))
    for (const p of packages)
      problems.push(`${p.name}@${p.versions.join(',')}: ${licence} (shipped dependency)`)

for (const [licence, packages] of Object.entries(list(false)))
  if (!allowed(licence))
    for (const p of packages)
      if (!DEV_ONLY_EXCEPTIONS[p.name] && !problems.some((x) => x.startsWith(`${p.name}@`)))
        problems.push(`${p.name}@${p.versions.join(',')}: ${licence}`)

const shippedNames = new Set(Object.values(prod).flatMap((ps) => ps.map((p) => p.name)))
for (const name of Object.keys(DEV_ONLY_EXCEPTIONS))
  if (shippedNames.has(name)) problems.push(`${name}: excepted as dev-only, but it is a shipped dependency`)

if (problems.length > 0) {
  console.error(`Licences not on the allow-list:\n  ${problems.join('\n  ')}`)
  console.error('Replace the package, or add a dated, reasoned exception in scripts/check-licenses.ts.')
  process.exit(1)
}
const count = Object.values(list(false)).reduce((n, ps) => n + ps.length, 0)
console.log(`Licences OK: ${count} packages, all on the allow-list or excepted with a reason.`)
