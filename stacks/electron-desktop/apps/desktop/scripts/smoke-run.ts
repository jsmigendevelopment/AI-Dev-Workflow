import { spawn } from 'node:child_process'

/** How a smoke start ended. */
export interface SmokeResult {
  ok: boolean
  detail: string
}

/** Starts a program and waits for it to exit 0 within the limit; a program still running is killed. */
export function runSmoke(command: string, args: string[], limitMs: number): Promise<SmokeResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, detail: `still running after ${limitMs} ms` })
    }, limitMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, detail: `could not start: ${error.message}` })
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, detail: code === null ? `killed by ${signal}` : `exit code ${code}` })
    })
  })
}
