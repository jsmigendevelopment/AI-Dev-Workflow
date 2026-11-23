// GitHub Free gives a private repository no environments and no environment secrets, so
// setup-github sets the repository variable SECRETS_MODE to "repository" there. The workflows then
// read repository secrets named TEST_<name> (test and previews) and PRODUCTION_<name>; connect
// reads the same variable, so it always writes the names the workflows read.
import type { Run } from './places.ts'

export type SecretsMode = 'environment' | 'repository'

export const SECRETS_MODE_VARIABLE = 'SECRETS_MODE'

/** "repository" only when the repository variable says so; anything else keeps environments. */
export function readSecretsMode(run: Run, repo: string | null): SecretsMode {
  if (!repo) return 'environment'
  const r = run('gh', ['variable', 'get', SECRETS_MODE_VARIABLE, '-R', repo])
  return r.status === 0 && r.stdout.trim() === 'repository' ? 'repository' : 'environment'
}

/** The prefix a GitHub environment's values get as repository secrets. Previews use test's. */
export const repositoryPrefix = (env: 'test' | 'preview' | 'production') =>
  env === 'production' ? 'PRODUCTION_' : 'TEST_'
