import type { BuildFlavour, BuildInfo, Health } from '@app/contract/health'

const FLAVOUR_LABEL: Record<BuildFlavour, string> = {
  release: 'Release build',
  e2e: 'E2E test build',
  dev: 'Development build',
}

/**
 * The About box's text: the version, the short commit injected at build time, which build it is and,
 * when asked (`null`: no answer), whether the engine runs and its data file opened, with the driver.
 */
export function aboutText(info: BuildInfo, health?: Health | null): string {
  const lines = [`Version ${info.version}`, `Commit ${info.commit.slice(0, 7)}`, FLAVOUR_LABEL[info.flavour]]
  if (health === undefined) return lines.join('\n')
  if (health === null) return [...lines, 'Engine: not running'].join('\n')
  const data = health.data.isOk ? 'ok' : 'unreadable'
  return [...lines, 'Engine: running', `Data: ${data} (${health.data.driver})`].join('\n')
}
