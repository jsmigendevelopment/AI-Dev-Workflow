// The package-level boundary, read from package.json files (no imports parsed here):
// - an app never depends on another app;
// - a package never depends on an app;
// - a shared package never ships React, React Native or a platform SDK as a dependency.
//   It may list React as a peer, so each app brings its own copy (see README, "React versions").
// eslint.workspace.config.js covers the other half: relative imports that cross a workspace folder.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const read = (dir) => {
  const file = join(root, dir, 'package.json')
  return existsSync(file) ? { dir, pkg: JSON.parse(readFileSync(file, 'utf8')) } : null
}
const list = (folder) =>
  existsSync(join(root, folder))
    ? readdirSync(join(root, folder), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => read(`${folder}/${d.name}`))
        .filter(Boolean)
    : []

const apps = list('apps')
const packages = list('packages')
const appNames = new Set(apps.map((a) => a.pkg.name))
const platformOnly = [
  /^react$/,
  /^react-dom$/,
  /^react-native/,
  /^expo/,
  /^@expo\//,
  /^@clerk\//,
  /^electron/,
]
const deps = (pkg) => ({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies })

const problems = []
for (const { dir, pkg } of [...apps, ...packages]) {
  for (const name of Object.keys(deps(pkg))) {
    if (appNames.has(name)) problems.push(`${dir} depends on the app "${name}". Apps are never imported.`)
  }
}
for (const { dir, pkg } of packages) {
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    if (platformOnly.some((re) => re.test(name)))
      problems.push(`${dir} has "${name}" as a dependency. Shared packages stay platform-free (use a peer).`)
  }
}

if (problems.length > 0) {
  console.error('Workspace dependency check failed:\n' + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
console.log(`Workspace dependencies OK (${apps.length} apps, ${packages.length} packages).`)
