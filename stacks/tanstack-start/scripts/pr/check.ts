// `pnpm pr:rules <n>`: the pull request rules for pull request <n>, run from the session before
// merge (the pack ships no GitHub Actions workflows). Reads the pull request through GitHub's REST
// API with `gh` (the repo comes from the git remote), then applies rules.ts.
import { execFileSync } from 'node:child_process'

import { issueLinkProblems, type PullRequest, sizeProblem } from './rules.ts'

const pr = process.argv[2] ?? ''
if (!/^\d+$/.test(pr)) {
  console.error('Usage: pnpm pr:rules <pull request number>')
  process.exit(2)
}

const gh = (args: string[]) => execFileSync('gh', ['api', ...args], { encoding: 'utf8' })
const fields =
  '{body: (.body // ""), branch: .head.ref, labels: ([.labels[].name] | join(",")), author: .user.login}'
const pull = JSON.parse(gh([`repos/{owner}/{repo}/pulls/${pr}`, '--jq', fields])) as PullRequest
// `git diff --numstat` lines from the API's file list, so the size rule reads the same input.
const numstat = gh([
  '--paginate',
  `repos/{owner}/{repo}/pulls/${pr}/files`,
  '--jq',
  '.[] | "\\(.additions)\\t\\(.deletions)\\t\\(.filename)"',
])

const problems = [...issueLinkProblems(pull), sizeProblem(numstat, pull.labels)].filter((p) => p !== null)
for (const problem of problems) console.error(problem)
if (problems.length) process.exit(1)
console.log(`#${pr}: tied to an issue, and small enough to review.`)
