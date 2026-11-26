import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const scan = () => spawnSync('pnpm', ['run', '--silent', 'scan:secrets'], { cwd: root, encoding: 'utf8' })

/** Random letters and digits, so a planted value never matches a real token. */
const random = (length: number) =>
  randomBytes(length * 2)
    .toString('base64')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, length)
const jwtPart = (claims: object) => Buffer.from(JSON.stringify(claims)).toString('base64url')

// Each value is made here, at run time, and deleted after: none is ever committed.
const planted = {
  'a GitHub token': `GITHUB_TOKEN = "ghp_${random(36)}"`,
  'a JWT': `"id_token": "${jwtPart({ alg: 'RS256' })}.${jwtPart({ sub: random(12) })}.${random(43)}"`,
  'a Google API key': `key: "AIza${random(35)}"`,
  // Joined, so this file itself doesn't match the password pattern.
  'a password': ['password', `"${random(16)}"`].join(' = '),
}

/** Writes one file into a fresh folder in the repo, runs the scan, then deletes the folder. */
function scanWith(content: string) {
  const dir = mkdtempSync(join(root, 'tests', 'planted-'))
  writeFileSync(join(dir, 'settings.txt'), `${content}\n`)
  try {
    return scan()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('secret scan', () => {
  it('passes on the repo as committed', () => {
    const result = scan()
    expect(result.stdout + result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it.each(Object.entries(planted))(
    'WHEN a committed file holds a token-shaped string (%s) THEN the secret scan script fails',
    (_kind, line) => {
      const result = scanWith(line)
      expect(result.status).not.toBe(0)
      expect(result.stdout).toMatch(/planted-.*settings\.txt/)
    },
  )

  it('WHEN a committed file that .gitignore matches holds a token THEN the secret scan script fails', () => {
    // *.log is ignored, so only a force-add puts it in git. Unstaged and deleted after: never committed.
    // A log rather than .env.local: agents never write .env files; the ignore rule is the same.
    const dir = mkdtempSync(join(root, 'tests', 'planted-'))
    const file = join(dir, 'session.log')
    writeFileSync(file, `GITHUB_TOKEN=ghp_${random(36)}\n`)
    try {
      execFileSync('git', ['add', '--force', file], { cwd: root })
      const result = scan()
      expect(result.status).not.toBe(0)
      expect(result.stdout).toMatch(/planted-.*session\.log/)
    } finally {
      execFileSync('git', ['rm', '--cached', '--quiet', '--force', file], { cwd: root })
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails on a comment that turns the scan off', () => {
    const disable = ['secretlint', 'disable'].join('-')
    const result = scanWith(`// ${disable}\nnothing secret here`)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/planted-.*settings\.txt/)
  })
})
