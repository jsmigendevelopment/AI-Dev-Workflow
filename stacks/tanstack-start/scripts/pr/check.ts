// `node scripts/pr/check.ts size|issue`: run by .github/workflows/pr-rules.yml on each pull request.
// Reads the pull request from the environment (BODY, BRANCH, LABELS, AUTHOR, BASE).
import { execFileSync } from 'node:child_process'

import { issueLinkProblems, sizeProblem } from './rules.ts'

const env = (name: string) => process.env[name] ?? ''
const which = process.argv[2]

let problems: string[]
if (which === 'size') {
  const numstat = execFileSync('git', ['diff', '--numstat', `${env('BASE')}...HEAD`], { encoding: 'utf8' })
  problems = [sizeProblem(numstat, env('LABELS'))].filter((p) => p !== null)
} else if (which === 'issue') {
  problems = issueLinkProblems({
    body: env('BODY'),
    branch: env('BRANCH'),
    labels: env('LABELS'),
    author: env('AUTHOR'),
  })
} else {
  console.error('Usage: node scripts/pr/check.ts size|issue')
  process.exit(2)
}
for (const problem of problems) console.error(problem)
if (problems.length) process.exit(1)
console.log(which === 'size' ? 'Size OK.' : 'Tied to an issue.')
