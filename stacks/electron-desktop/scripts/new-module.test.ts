import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { ESLint } from 'eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pascal } from './module-templates.ts'

const root = path.resolve(import.meta.dirname, '..')
// The generator writes into a copy of the repo, so the working tree (and every other test reading it)
// never sees the generated files. node_modules is linked, not copied.
let copy: string
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: copy, encoding: 'utf8', stdio: 'pipe' })
const generate = (...args: string[]) => run(process.execPath, ['scripts/new-module.ts', ...args])
const bin =
  (file: string, ...args: string[]) =>
  () =>
    run(process.execPath, [path.join(root, 'node_modules', file), ...args])

beforeAll(() => {
  copy = mkdtempSync(path.join(tmpdir(), 'app-gen-'))
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  })
  for (const file of files.split('\0').filter((f) => f && existsSync(path.join(root, f)))) {
    cpSync(path.join(root, file), path.join(copy, file))
  }
  for (const dir of ['node_modules', 'apps/desktop/node_modules']) {
    symlinkSync(path.join(root, dir), path.join(copy, dir), 'junction')
  }
})
afterAll(() => {
  rmSync(copy, { recursive: true, force: true })
})

describe('pnpm new:module', () => {
  it('turns todo-items into TodoItems', () => {
    expect(pascal('todo-items')).toBe('TodoItems')
  })

  it('refuses a name that is not kebab-case, a screen command that takes a payload, and an existing file', () => {
    expect(() => generate('screen', 'TodoItems', 'health.get')).toThrow()
    expect(() => generate('screen', 'refused', 'preferences.update')).toThrow()
    expect(() => generate('screen', 'preferences', 'preferences.get')).toThrow(/Refusing to overwrite/)
  })

  it('WHEN pnpm new:module makes a screen module, a main module and an engine adapter THEN each passes lint and typecheck unchanged', async () => {
    generate('screen', 'todo-items', 'health.get')
    generate('main', 'todo-items')
    generate('adapter', 'todo-items')
    const dirs = [
      'apps/desktop/src/renderer/modules/todo-items',
      'apps/desktop/src/main/modules/todo-items',
      'packages/engine/src/adapters/todo-items',
    ]
    const results = await new ESLint({ cwd: copy }).lintFiles(dirs)
    const problems = results.flatMap((r) =>
      r.messages.map((m) => `${path.relative(copy, r.filePath)}: ${m.ruleId} ${m.message}`),
    )
    expect(results).toHaveLength(10)
    expect(problems).toEqual([])
    expect(bin('prettier/bin/prettier.cjs', '--check', ...dirs), 'prettier').not.toThrow()
    expect(bin('knip/bin/knip.js'), 'knip').not.toThrow()
    for (const project of [
      'apps/desktop/tsconfig.renderer.json',
      'apps/desktop/tsconfig.main.json',
      'packages/engine/tsconfig.json',
    ]) {
      expect(bin('typescript/bin/tsc', '--noEmit', '-p', project), project).not.toThrow()
    }
  }, 180_000)
})
