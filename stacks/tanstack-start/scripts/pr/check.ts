// `pnpm pr:rules <n>`: the pull request rules for pull request <n>, run from the session before
// merge (the pack ships no GitHub Actions workflows). Reads the pull request through GitHub's REST
// API with `gh` (the repo comes from the git remote), then applies rules.ts and the kit's size rule.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { issueLinkProblems, type PullRequest, SIZE_SCRIPT } from './rules.ts'

const pr = process.argv[2] ?? ''
if (!/^\d+$/.test(pr)) {
  console.error('Usage: pnpm pr:rules <pull request number>')
  process.exit(2)
}
if (!existsSync(SIZE_SCRIPT)) {
  console.error(`The kit's size check (${SIZE_SCRIPT}) isn't installed: run npx onrails@latest update.`)
  process.exit(2)
}

const gh = (args: string[]) => execFileSync('gh', ['api', ...args], { encoding: 'utf8' })
const fields =
  '{body: (.body // ""), branch: .head.ref, labels: ([.labels[].name] | join(",")), author: .user.login}'
const pull = JSON.parse(gh([`repos/{owner}/{repo}/pulls/${pr}`, '--jq', fields])) as PullRequest
const repo = gh(['repos/{owner}/{repo}', '--jq', '.full_name']).trim()

const problems = issueLinkProblems(pull)
for (const problem of problems) console.error(problem)
// It prints the size, the biggest files and, over the limit, why it fails.
const size = spawnSync(process.execPath, [SIZE_SCRIPT, pr, '--repo', repo], { stdio: 'inherit' })
// Stopped by a signal, it has no status: that's an error, never a pass.
if (size.status !== 0) process.exit(size.status ?? 2)
if (problems.length) process.exit(1)
console.log(`#${pr}: tied to an issue, and small enough to review.`)
