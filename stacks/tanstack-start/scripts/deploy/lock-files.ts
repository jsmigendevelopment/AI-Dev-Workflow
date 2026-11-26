// The real file and process checks behind the deploy lock (lock.ts), for scripts/deploy.ts and the
// lock's two-process test.
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const code = (error: unknown) => (error as NodeJS.ErrnoException).code

/** Writes a new file; false when it exists already (the deploy lock). */
export function create(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true })
  try {
    writeFileSync(path, text, { flag: 'wx' })
    return true
  } catch (error) {
    if (code(error) === 'EEXIST') return false
    throw error
  }
}

/**
 * A plain file's text, never through a symlink: undefined when it is missing, a link or not a file.
 * O_NOFOLLOW also refuses a link swapped in after the lstat (Windows has no O_NOFOLLOW; the lstat
 * still refuses a link there).
 */
export function readPlain(path: string) {
  try {
    if (!lstatSync(path).isFile()) return undefined
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      return readFileSync(fd, 'utf8')
    } finally {
      closeSync(fd)
    }
  } catch (error) {
    // Gone (its run just ended) or a link swapped in: both read as "not a lock file here".
    if (code(error) === 'ENOENT' || code(error) === 'ELOOP') return undefined
    throw error
  }
}

/** Signal 0 checks a process exists without touching it. EPERM: it exists, under another user. */
export function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return code(error) === 'EPERM'
  }
}
