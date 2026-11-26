import type { BuildInfo, Health } from '@app/contract/health'

/** What the health service needs from the composition root. */
export interface HealthDeps {
  build: BuildInfo
  dataDir: string
  data: Pick<Health['data'], 'isOk' | 'driver'>
}

/** Answers `health.get`. A running engine is the one answering, so `engine` is always "running". */
export function createHealthService({ build, dataDir, data }: HealthDeps): { get(): Health } {
  return {
    get: () => ({
      ...build,
      engine: 'running',
      data: { isOk: data.isOk, folder: dataDir, driver: data.driver },
    }),
  }
}
