import { spawn } from 'node:child_process'
import path from 'node:path'

const SHORTCUT_ARGS: Record<string, string> = {
  '--squirrel-install': '--createShortcut',
  '--squirrel-updated': '--createShortcut',
  '--squirrel-uninstall': '--removeShortcut',
}

/**
 * Squirrel.Windows starts the app with a `--squirrel-*` flag while it installs, updates or removes it.
 * Make or remove the shortcuts through Update.exe, then tell the caller to quit. Replaces the archived
 * electron-squirrel-startup package. The zip build never sees these flags.
 */
export function handleSquirrelEvent(argv: readonly string[], execPath: string): boolean {
  const event = argv[1]
  if (process.platform !== 'win32' || !event?.startsWith('--squirrel-')) return false
  const shortcutArg = SHORTCUT_ARGS[event]
  if (shortcutArg) {
    const updateExe = path.resolve(path.dirname(execPath), '..', 'Update.exe')
    spawn(updateExe, [shortcutArg, path.basename(execPath)], { detached: true }).unref()
  }
  return true
}
