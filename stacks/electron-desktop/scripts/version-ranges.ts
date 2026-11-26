// Every dependency is pinned exactly (the dependencies skill, rule 11). Upgrades arrive as their own
// pull requests, so a range in any package.json fails the tests.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const
const EXACT = /^(?:\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|workspace:\*)$/

type Manifest = Partial<Record<(typeof SECTIONS)[number], Record<string, string>>>

const root = join(import.meta.dirname, '..')

/** The root package.json and one per workspace folder in pnpm-workspace.yaml. */
export function workspaceManifests(): { path: string; manifest: Manifest }[] {
  const workspace = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as { packages: string[] }
  const folders = workspace.packages.map((glob) => glob.replace(/\/\*$/, ''))
  const paths = ['package.json', ...folders.flatMap((folder) => packageFiles(folder))]
  return paths.map((path) => ({
    path,
    manifest: JSON.parse(readFileSync(join(root, path), 'utf8')) as Manifest,
  }))
}

function packageFiles(folder: string): string[] {
  return readdirSync(join(root, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${folder}/${entry.name}/package.json`)
}

/** One line per dependency in the manifest that isn't an exact version or a workspace link. */
export function rangeProblems(path: string, manifest: Manifest): string[] {
  return SECTIONS.flatMap((section) =>
    Object.entries(manifest[section] ?? {})
      .filter(([, version]) => !EXACT.test(version))
      .map(([name, version]) => `${path}: ${section}.${name} is "${version}"`),
  )
}
