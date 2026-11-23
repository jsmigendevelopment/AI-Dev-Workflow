import type { BuildTarget } from './authorized-parties'

/** What this build was made for, inlined by vite.config.ts. Read on the server only. */
export const BUILD_TARGET: BuildTarget = {
  deployEnv:
    import.meta.env.CLOUDFLARE_ENV === 'test' || import.meta.env.CLOUDFLARE_ENV === 'production'
      ? import.meta.env.CLOUDFLARE_ENV
      : 'local',
  testWorker: import.meta.env.TEST_WORKER ?? '',
  siteUrl: import.meta.env.SITE_URL ?? '',
}
