import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Each boundary rule is proved on a deliberate bad import before it is trusted.
// The fixtures are ignored by `pnpm lint`; this test lints them on purpose.
const root = fileURLToPath(new URL('..', import.meta.url))
const eslint = new ESLint({ cwd: root, ignore: false })

async function messagesOf(file: string, ruleId: string): Promise<string[]> {
  const [result] = await eslint.lintFiles([file])
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.message)
}

const boundaryMessages = (file: string) => messagesOf(file, 'boundaries/dependencies')

describe('boundary rules', () => {
  it('WHEN a lint fixture under apps/desktop/src/renderer/ imports electron or a node:* module THEN pnpm lint reports the process rule', async () => {
    for (const fixture of ['imports-electron.ts', 'imports-node.ts']) {
      const messages = await boundaryMessages(`apps/desktop/src/renderer/lint-fixtures/${fixture}`)
      expect(messages, fixture).toHaveLength(1)
      expect(messages[0], fixture).toMatch(/^Process rule:/)
    }
  })

  it('WHEN a lint fixture under packages/engine imports electron or a file in apps/ THEN pnpm lint reports the engine rule', async () => {
    for (const fixture of ['imports-electron.ts', 'imports-app.ts']) {
      const messages = await boundaryMessages(`packages/engine/src/lint-fixtures/${fixture}`)
      expect(messages, fixture).toHaveLength(1)
      expect(messages[0], fixture).toMatch(/^Engine rule:/)
    }
  })

  it('WHEN a lint fixture *.service.ts imports node:fs or electron THEN pnpm lint reports the layer rule', async () => {
    for (const fixture of [
      'packages/engine/src/lint-fixtures/imports-fs.service.ts',
      'apps/desktop/src/main/lint-fixtures/imports-electron.service.ts',
    ]) {
      const messages = await messagesOf(fixture, 'no-restricted-imports')
      expect(messages, fixture).toHaveLength(1)
      expect(messages[0], fixture).toMatch(/Layer rule:/)
    }
  })

  it('WHEN a lint fixture outside ipc/register.ts calls ipcMain.handle, or an engine file outside adapters/ imports node:child_process, THEN pnpm lint fails', async () => {
    const handle = await messagesOf(
      'apps/desktop/src/main/lint-fixtures/calls-ipc-handle.ts',
      'no-restricted-properties',
    )
    expect(handle).toHaveLength(1)
    expect(handle[0]).toMatch(/IPC rule:/)
    const spawn = await messagesOf(
      'packages/engine/src/lint-fixtures/imports-child-process.ts',
      'no-restricted-imports',
    )
    expect(spawn).toHaveLength(1)
    expect(spawn[0]).toMatch(/Engine rule:/)
  })

  it('WHEN a lint fixture outside packages/engine/src/db/ imports the SQLite driver THEN pnpm lint fails', async () => {
    for (const fixture of [
      'packages/engine/src/lint-fixtures/imports-sqlite.ts',
      'apps/desktop/src/main/lint-fixtures/imports-sqlite.ts',
    ]) {
      const messages = await messagesOf(fixture, 'no-restricted-imports')
      expect(messages, fixture).toHaveLength(1)
      expect(messages[0], fixture).toMatch(/only packages\/engine\/src\/db\/ imports the SQLite driver/)
    }
  })

  it('allows the SQLite driver in packages/engine/src/db/', async () => {
    expect(await messagesOf('packages/engine/src/db/database.ts', 'no-restricted-imports')).toEqual([])
  })

  it('WHEN a lint fixture in one renderer or engine module imports another module THEN pnpm lint reports the module rule', async () => {
    for (const fixture of [
      'apps/desktop/src/renderer/modules/lint-fixtures/imports-preferences.ts',
      'packages/engine/src/modules/lint-fixtures/imports-preferences.ts',
    ]) {
      const messages = await boundaryMessages(fixture)
      expect(messages, fixture).toHaveLength(1)
      expect(messages[0], fixture).toMatch(/^Module rule:/)
    }
  })

  it('allows ipcMain.handle in ipc/register.ts', async () => {
    expect(await messagesOf('apps/desktop/src/main/ipc/register.ts', 'no-restricted-properties')).toEqual([])
  })

  it('allows the imports the real code makes', async () => {
    for (const file of [
      'apps/desktop/src/main/main.ts',
      'apps/desktop/src/main/composition.ts',
      'apps/desktop/src/preload/preload.ts',
      'packages/engine/src/composition.ts',
      'packages/engine/src/engine-process.ts',
      'packages/engine/src/modules/health/health.service.ts',
      'packages/engine/src/modules/preferences/preferences.service.ts',
      'packages/engine/src/modules/preferences/preferences.repository.ts',
      'apps/desktop/src/renderer/modules/preferences/ui/preferences-section.tsx',
      'apps/desktop/src/renderer/modules/preferences/ui/preferences-form.tsx',
      'apps/desktop/src/renderer/routes/preferences-page.tsx',
      'apps/desktop/src/renderer/routes/home-page.tsx',
      'apps/desktop/src/renderer/components/app-shell.tsx',
      'apps/desktop/src/renderer/main.tsx',
    ]) {
      expect(await boundaryMessages(file), file).toEqual([])
    }
  })
})
