import { describe, expect, it } from 'vitest'

import { rangeProblems, workspaceManifests } from './version-ranges.ts'

describe('version ranges', () => {
  it('WHEN any package.json in the workspace has a version range THEN a test fails', () => {
    const problems = workspaceManifests().flatMap(({ path, manifest }) => rangeProblems(path, manifest))
    expect(problems).toEqual([])
  })

  it('reports ^, ~, * and latest, and accepts exact versions and workspace links', () => {
    const manifest = {
      dependencies: { a: '^1.0.0', b: '~1.0.0', c: '1.0.0', d: 'workspace:*' },
      devDependencies: { e: '*', f: 'latest', g: '>=2' },
    }
    expect(rangeProblems('package.json', manifest)).toEqual([
      'package.json: dependencies.a is "^1.0.0"',
      'package.json: dependencies.b is "~1.0.0"',
      'package.json: devDependencies.e is "*"',
      'package.json: devDependencies.f is "latest"',
      'package.json: devDependencies.g is ">=2"',
    ])
  })
})
