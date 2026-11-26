// The deploy lock on real files (lock-files.ts), with two real processes racing for one lock left by
// an ended run. The fakes' interleavings are in follow-ups.test.ts.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readPlain } from './lock-files'

const module = (file: string) => pathToFileURL(join(import.meta.dirname, file)).href

/** One deploy: waits for `go`, then holds the lock for 500 ms. `alive` pauses to widen the race. */
const racer = `
import { appendFileSync, rmSync } from 'node:fs'
import { oneAtATime } from '${module('lock.ts')}'
import { alive, create, readPlain } from '${module('lock-files.ts')}'
const [dir, name, go] = process.argv.slice(2)
const log = (line) => appendFileSync(dir + '/log', name + ' ' + line + '\\n')
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const deps = {
  run: async () => ({ status: 0, stdout: dir + '\\n', stderr: '' }),
  create,
  readPlain,
  remove: (path) => rmSync(path, { force: true }),
  alive: (pid) => (pause(300), alive(pid)),
  pid: process.pid,
  log: () => {},
}
while (Date.now() < Number(go)) pause(5)
try {
  await oneAtATime(deps, 'test', 'deploy', async () => {
    log('in')
    await new Promise((resolve) => setTimeout(resolve, 500))
    log('out')
  })
} catch {
  log('stopped')
}
`

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-lock-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const runRacer = (script: string, name: string, go: number) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script, dir, name, String(go)], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${name} exited with ${code}`))))
  })

describe('the deploy lock on real files', () => {
  it('AC-150-7: WHEN two deploys find the same ended run’s lock at once THEN at most one of them holds it', async () => {
    // A PID above Linux's highest possible one: the run that wrote this lock has ended.
    writeFileSync(join(dir, 'onrails-deploy-test.lock'), '99999999 2026-11-26T10:00:00Z')
    const script = join(dir, 'racer.mjs')
    writeFileSync(script, racer)
    const go = Date.now() + 1500
    await Promise.all(['a', 'b'].map((name) => runRacer(script, name, go)))
    const log = readFileSync(join(dir, 'log'), 'utf8').trim().split('\n')
    let holding = 0
    for (const line of log) {
      holding += line.endsWith(' in') ? 1 : line.endsWith(' out') ? -1 : 0
      expect(holding, log.join('\n')).toBeLessThanOrEqual(1)
    }
    expect(log.filter((line) => line.endsWith(' in')).length).toBeGreaterThanOrEqual(1)
  }, 15_000)

  it('AC-150-7: WHEN the lock is a link THEN the reader never follows it', () => {
    const target = join(dir, 'elsewhere')
    writeFileSync(target, '1 2026-11-26T10:00:00Z')
    symlinkSync(target, join(dir, 'link.lock'))
    expect(readPlain(join(dir, 'link.lock'))).toBeUndefined()
    expect(readPlain(target)).toBe('1 2026-11-26T10:00:00Z')
    expect(readPlain(join(dir, 'missing.lock'))).toBeUndefined()
  })
})
