import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { issueLinkProblems, SIZE_SCRIPT } from './rules'

const pr = { body: 'Adds tags.\n\nCloses #12', branch: 'feat/12-tags', labels: '', author: 'ann' }

describe('pull request size', () => {
  it("runs the kit's one size rule, pr-size.mjs (#377)", () => {
    const r = spawnSync(process.execPath, [SIZE_SCRIPT], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Usage: pr-size\.mjs <n> --repo <owner>\/<name>/)
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
