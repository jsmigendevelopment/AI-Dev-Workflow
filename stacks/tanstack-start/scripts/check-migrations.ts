// `pnpm check:migrations`: fails on a migration that drops or renames, requires a column without a
// default, or stores money in a float. The rules and how to accept one on purpose: migrations/rules.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { lintMigrations, RULES } from './migrations/rules.ts'

const dir = process.argv[2] ?? 'migrations'
const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((name) => ({ name, sql: readFileSync(`${dir}/${name}`, 'utf8') }))
  : []
const findings = lintMigrations(files)
for (const f of findings) console.error(`${dir}/${f.file}: ${f.rule}: ${f.message}`)
if (findings.length) {
  console.error(
    `\n${findings.length} unsafe change(s). Split it into expand and contract steps, or, if the person ` +
      'agreed (no data to keep yet), add `-- migration-lint-allow <rule>: <reason> (#issue)` to that file.',
  )
  process.exit(1)
}
console.log(`Migrations OK: ${files.length} checked against ${Object.keys(RULES).length} rules.`)
