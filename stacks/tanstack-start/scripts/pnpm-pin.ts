// The pnpm the deploys and `pnpm check:merge` run is whichever is first on PATH. It must be the one
// package.json pins: an older pnpm can't read the lockfile (`pnpm audit` and the licence check fail
// with ERR_PNPM_BROKEN_LOCKFILE), and doesn't install on its own before a run.

/** The version in package.json's `packageManager` (`pnpm@12.21.0+sha512...`), or undefined. */
function pinned(packageJson: string | undefined): string | undefined {
  try {
    const field = (JSON.parse(packageJson ?? '{}') as { packageManager?: string }).packageManager
    return /^pnpm@([^+\s]+)/.exec(field ?? '')?.[1]
  } catch {
    return undefined // package.json isn't JSON: there is no pin to compare with
  }
}

/** Why `pnpm --version`'s output isn't the pinned version, with the fix; undefined when it is or nothing is pinned. */
export function pnpmProblem(packageJson: string | undefined, onPath: string): string | undefined {
  const want = pinned(packageJson)
  const have = onPath.trim()
  if (!want || have === want) return undefined
  return (
    `pnpm ${have || '(none)'} is first on PATH, and package.json pins pnpm@${want}. ` +
    `Put the pinned one first (npm install -g pnpm@${want}, or corepack enable pnpm), then run this again.`
  )
}
