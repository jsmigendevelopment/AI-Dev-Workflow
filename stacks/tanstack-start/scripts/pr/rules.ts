// Pull request rules (app-conventions rules 3 and code-style rule 13), as pure functions so
// `pnpm pr:rules <n>` (scripts/pr/check.ts) runs exactly what the tests check.

/**
 * The size rule is the kit's, so the limit and what counts live in one place (#377): 1,000 changed
 * lines or more fails, lockfiles, test fixtures and the files .gitattributes marks
 * `linguist-generated` not counted, unless the pull request has the `size-exception` label and a
 * `Size exception: <reason>` line. `pnpm pr:rules` runs it.
 */
export const SIZE_SCRIPT = '.agents/skills/coordinate/scripts/pr-size.mjs'

const hasLabel = (labels: string, name: string) =>
  labels
    .split(',')
    .map((l) => l.trim())
    .includes(name)

const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i
const BRANCH = /^(?:feat|fix|chore)\/(\d+)-[a-z0-9][a-z0-9-]*$/

export interface PullRequest {
  body: string
  branch: string
  labels: string
  author: string
}

/** Every reason the pull request isn't tied to an issue. Empty when it is. */
export function issueLinkProblems(pr: PullRequest): string[] {
  if (pr.author === 'dependabot[bot]' || hasLabel(pr.labels, 'no-issue')) return []
  const problems: string[] = []
  const closes = CLOSES.exec(pr.body)
  const branch = BRANCH.exec(pr.branch)
  if (!closes) problems.push('The description needs `Closes #<issue>` (or Fixes / Resolves).')
  if (!branch)
    problems.push(`The branch "${pr.branch}" must look like feat/<issue>-short-name (or fix/, chore/).`)
  if (closes && branch && closes[1] !== branch[1])
    problems.push(`The branch names issue #${branch[1]} but the description closes #${closes[1]}.`)
  return problems
}
