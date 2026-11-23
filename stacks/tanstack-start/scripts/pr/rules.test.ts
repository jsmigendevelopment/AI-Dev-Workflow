import { describe, expect, it } from 'vitest'

import { changedLines, issueLinkProblems, sizeProblem } from './rules'

const pr = { body: 'Adds tags.\n\nCloses #12', branch: 'feat/12-tags', labels: '', author: 'ann' }

describe('pull request size', () => {
  const big = '300\t150\tsrc/modules/tags/server/tags.service.ts'

  it('counts added and removed lines, but not lockfiles, generated files or binaries', () => {
    const numstat = [
      '10\t5\tsrc/a.ts',
      '900\t800\tpnpm-lock.yaml',
      '40\t0\tsrc/routeTree.gen.ts',
      '-\t-\te2e/visual.spec.ts-snapshots/home-desktop.png',
      '200\t0\tmigrations/meta/0001_snapshot.json',
    ].join('\n')
    expect(changedLines(numstat)).toBe(15)
  })

  it('fails over 400 lines unless the pull request has the large-pr label', () => {
    expect(sizeProblem(big, '')).toMatch(/450 changed lines/)
    expect(sizeProblem(big, 'lane:risky, large-pr')).toBeNull()
    expect(sizeProblem('200\t200\tsrc/a.ts', '')).toBeNull()
  })
})

describe('pull request issue link', () => {
  it('passes Closes, Fixes or Resolves with a matching feat, fix or chore branch', () => {
    expect(issueLinkProblems(pr)).toEqual([])
    expect(issueLinkProblems({ ...pr, body: 'fixes #12', branch: 'fix/12-typo' })).toEqual([])
    expect(issueLinkProblems({ ...pr, body: 'Resolves #12', branch: 'chore/12-deps' })).toEqual([])
  })

  it('fails without a closing keyword, with a bad branch, or when the two disagree', () => {
    expect(issueLinkProblems({ ...pr, body: 'See #12' })).toHaveLength(1)
    expect(issueLinkProblems({ ...pr, branch: 'tags' })).toHaveLength(1)
    expect(issueLinkProblems({ ...pr, branch: 'feature/12-tags' })).toHaveLength(1)
    expect(issueLinkProblems({ ...pr, branch: 'feat/13-tags' })[0]).toMatch(/#13.*#12/)
  })

  it('exempts Dependabot and the no-issue label', () => {
    const bare = {
      body: '',
      branch: 'dependabot/npm_and_yarn/vite-8.4.0',
      labels: '',
      author: 'dependabot[bot]',
    }
    expect(issueLinkProblems(bare)).toEqual([])
    expect(issueLinkProblems({ ...bare, author: 'ann', labels: 'no-issue' })).toEqual([])
    expect(issueLinkProblems({ ...bare, author: 'ann' })).toHaveLength(2)
  })
})
