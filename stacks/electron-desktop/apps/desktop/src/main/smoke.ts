import type { WebContents } from 'electron'

/**
 * `--smoke` (scripts/smoke.ts): quit once the first window has loaded. 0 if the screen loaded and the
 * engine answered `health.get` as running with its data file ok, 1 if not.
 */
export function exitAfterFirstLoad(
  contents: Pick<WebContents, 'once'>,
  isHealthy: () => Promise<boolean>,
  exit: (code: number) => void,
): void {
  contents.once('did-finish-load', () => {
    void isHealthy().then((healthy) => exit(healthy ? 0 : 1))
  })
  contents.once('did-fail-load', () => exit(1))
}
