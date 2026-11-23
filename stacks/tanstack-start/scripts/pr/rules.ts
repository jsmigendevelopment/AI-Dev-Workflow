// Pull request rules (app-conventions rules 3 and code-style rule 13), as pure functions so the
// CI workflow (.github/workflows/pr-rules.yml) runs exactly what the tests check.

export const MAX_CHANGED_LINES = 400

/** Lockfiles, generated files and screenshot baselines don't count toward the size. */
const NOT_COUNTED = [
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)routeTree\.gen\.ts$/,
  /(^|\/)worker-configuration\.d\.ts$/,
  /^migrations\/meta\//,
  /-snapshots\//,
]

const hasLabel = (labels: string, name: string) =>
  labels
    .split(',')
    .map((l) => l.trim())
    .includes(name)

/** `git diff --numstat` output → lines added plus removed, without the files above. Binary is `-`. */
export function changedLines(numstat: string): number {
  let total = 0
  for (const line of numstat.split('\n')) {
    const [added, removed, path] = line.split('\t')
    if (!path || NOT_COUNTED.some((p) => p.test(path))) continue
    total += (Number(added) || 0) + (Number(removed) || 0)
  }
  return total
}

/** Null when the size is fine; otherwise why it fails. */
export function sizeProblem(numstat: string, labels: string): string | null {
  const lines = changedLines(numstat)
  if (lines <= MAX_CHANGED_LINES || hasLabel(labels, 'large-pr')) return null
  return (
    `${lines} changed lines (over ${MAX_CHANGED_LINES}, lockfiles and generated files not counted). ` +
    'Split the pull request, or add the large-pr label and say why in the description.'
  )
}

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
