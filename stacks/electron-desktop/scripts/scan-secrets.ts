// `pnpm scan:secrets`: secretlint over every file git lists, tracked or new, with secretlint's own
// .gitignore filter off, so a force-added .env or log file is scanned too. Then it fails on any comment
// that turns secretlint off, since the recommended preset obeys them. No shell anywhere.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\0')
  // A tracked file deleted in the working tree is listed but can't be read.
  .filter((file) => file && existsSync(file))

// Run secretlint's own bin with this Node, so it works the same on Linux and Windows.
const secretlintBin = join(
  dirname(createRequire(import.meta.url).resolve('secretlint/package.json')),
  'bin/secretlint.js',
)
try {
  execFileSync(process.execPath, [secretlintBin, '--no-glob', '--no-gitignore', ...files], {
    stdio: 'inherit',
  })
} catch {
  // secretlint has printed what it found.
  process.exit(1)
}

// Joined, so this file doesn't name the comment itself.
const BYPASS = ['secretlint', 'disable'].join('-')
const offenders = files.filter((file) => {
  const text = readFileSync(file, 'utf8')
  return !text.includes('\0') && text.includes(BYPASS)
})
if (offenders.length > 0) {
  process.stderr.write(
    `A comment turns the secret scan off in:\n${offenders.map((f) => `  ${f}\n`).join('')}`,
  )
  process.exit(1)
}
