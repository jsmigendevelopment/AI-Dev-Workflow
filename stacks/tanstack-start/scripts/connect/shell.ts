// Runs a command with no shell, except a Windows .cmd or .bat shim (wrangler in node_modules/.bin),
// which only cmd.exe can start. For that one case every argument is quoted and every cmd.exe
// metacharacter escaped, twice, because cmd.exe parses the shim's line again. Arguments are
// only names, flags and paths, never a value, but they are escaped anyway.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { win32 } from 'node:path'

import type { Run } from './places.ts'

type Env = Record<string, string | undefined>

const META = /[()\][%!^"`<>&|;, *?]/g
// git and node are real executables: never through a shell.
const NO_SHELL = ['git', 'node']

/** One argument for a cmd.exe line: quoted, inner quotes and trailing backslashes doubled, escaped. */
export function cmdArg(arg: string, shim: boolean): string {
  let quoted = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')
  quoted = `"${quoted}"`.replace(META, '^$&')
  return shim ? quoted.replace(META, '^$&') : quoted
}

/** The file Windows would run for `cmd`, using PATH and PATHEXT, or undefined. */
export function findOnPath(cmd: string, env: Env, exists: (p: string) => boolean = existsSync) {
  const path = env.PATH ?? env.Path ?? ''
  const exts = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  for (const dir of path.split(';').filter(Boolean))
    for (const ext of exts) {
      const file = win32.join(dir, cmd + ext)
      if (exists(file)) return file
    }
  return undefined
}

/** How to start `cmd` on this platform: the program, its arguments, and whether args are verbatim. */
export function plan(
  cmd: string,
  args: string[],
  platform: NodeJS.Platform,
  env: Env,
  exists: (p: string) => boolean = existsSync,
) {
  if (platform !== 'win32' || NO_SHELL.includes(cmd)) return { file: cmd, args, verbatim: false }
  const found = findOnPath(cmd, env, exists)
  if (!found || !/^\.(cmd|bat)$/i.test(win32.extname(found)))
    return { file: found ?? cmd, args, verbatim: false }
  const line = [cmdArg(found, false), ...args.map((a) => cmdArg(a, true))].join(' ')
  return {
    file: env.ComSpec ?? env.COMSPEC ?? 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line}"`],
    verbatim: true,
  }
}

/** The runner every child goes through. GH_REPO is dropped so gh only uses the repo we pass. */
export function runner(env: Env, cwd: string, platform: NodeJS.Platform): Run {
  const childEnv: Env = { ...env, WRANGLER_SEND_METRICS: 'false' }
  delete childEnv.GH_REPO
  return (cmd, args, input) => {
    const p = plan(cmd, args, platform, childEnv)
    const r = spawnSync(p.file, p.args, {
      input,
      cwd,
      encoding: 'utf8',
      windowsVerbatimArguments: p.verbatim,
      // The Worker's types add its vars to ProcessEnv; a child's environment needs none of them.
      env: childEnv as NodeJS.ProcessEnv,
    })
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr || r.error?.message || '' }
  }
}
