// Where GitHub values go, on `ci = "actions"` only: on `ci = "local"` nothing reads them, so
// connect writes none ("none", #139). GitHub Free gives a private repository no environments and no
// environment secrets, so setup-github sets the repository variable SECRETS_MODE to "repository"
// there. The workflows then read repository secrets named TEST_<name> (test and previews) and
// PRODUCTION_<name>; connect reads the same variable, so it always writes the names they read.
import type { Ci } from '../cloudflare/ci-mode.ts'
import type { Run } from './places.ts'

export type SecretsMode = 'environment' | 'repository' | 'none'

export const SECRETS_MODE_VARIABLE = 'SECRETS_MODE'

/**
 * "none" on `ci = "local"`, without asking GitHub. Else "repository" only when the repository
 * variable says so; anything else keeps environments.
 */
export function readSecretsMode(run: Run, repo: string | null, ci: Ci): SecretsMode {
  if (ci === 'local') return 'none'
  if (!repo) return 'environment'
  const r = run('gh', ['variable', 'get', SECRETS_MODE_VARIABLE, '-R', repo])
  return r.status === 0 && r.stdout.trim() === 'repository' ? 'repository' : 'environment'
}

/** The prefix a GitHub environment's values get as repository secrets. Previews use test's. */
export const repositoryPrefix = (env: 'test' | 'preview' | 'production') =>
  env === 'production' ? 'PRODUCTION_' : 'TEST_'
