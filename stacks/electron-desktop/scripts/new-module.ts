import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { GeneratedFile, ModuleKind } from './module-templates.ts'
import { adapterModule, MODULE_KINDS, mainModule, screenModule } from './module-templates.ts'

// `pnpm new:module <screen|main|adapter> <name> [command]`: writes a module that passes lint and
// typecheck as it is, then says where to wire it. It never overwrites a file.
const root = path.resolve(import.meta.dirname, '..')
const USAGE =
  'Usage: pnpm new:module screen <name> <command>   (a screen module reading a command with no payload)\n' +
  '       pnpm new:module main <name>               (a main-process module)\n' +
  '       pnpm new:module adapter <name>            (an engine adapter)\n' +
  'Names are kebab-case, such as todo-items.'

const NEXT_STEP: Record<ModuleKind, string> = {
  screen:
    'Render its section from a route in apps/desktop/src/renderer/routes/, as preferences-page.tsx does.',
  main: 'Build it in apps/desktop/src/main/composition.ts.',
  adapter: 'Build it in packages/engine/src/composition.ts.',
}

/** True when the contract has `command` and it takes no payload, so the screen can send it bare. */
function isBareCommand(command: string): boolean {
  const commands = readFileSync(path.join(root, 'packages/contract/src/commands.ts'), 'utf8')
  return commands.includes(`'${command}': { payload: z.undefined(),`)
}

function filesFor(kind: ModuleKind, name: string, command: string | undefined): GeneratedFile[] {
  if (kind === 'main') return mainModule(name)
  if (kind === 'adapter') return adapterModule(name)
  if (!command || !isBareCommand(command)) {
    throw new Error(
      `"${command ?? ''}" is not a command with no payload in packages/contract/src/commands.ts`,
    )
  }
  return screenModule(name, command)
}

const isKind = (kind: string | undefined): kind is ModuleKind => MODULE_KINDS.some((k) => k === kind)

function main(args: string[]): void {
  const [kind, name, command] = args
  if (!isKind(kind) || !name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) throw new Error(USAGE)
  const files = filesFor(kind, name, command)
  const taken = files.filter((file) => existsSync(path.join(root, file.path)))
  if (taken.length > 0) throw new Error(`Refusing to overwrite: ${taken.map((f) => f.path).join(', ')}`)
  for (const file of files) {
    const target = path.join(root, file.path)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, file.content)
  }
  const paths = files.map((file) => file.path)
  execFileSync('pnpm', ['exec', 'prettier', '--log-level', 'warn', '--write', ...paths], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  process.stdout.write(`Wrote:\n${paths.map((p) => `  ${p}`).join('\n')}\nNext: ${NEXT_STEP[kind]}\n`)
}

try {
  main(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
