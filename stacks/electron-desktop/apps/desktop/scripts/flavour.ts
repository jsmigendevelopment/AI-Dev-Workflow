/** Which packaged flavour Forge builds: release unless APP_BUILD is exactly "e2e". */
export type PackageFlavour = 'release' | 'e2e'

type Env = Record<string, string | undefined>

/** Reads the flavour from the build environment; anything but "e2e" builds the release flavour. */
export function packageFlavour(env: Env): PackageFlavour {
  return env['APP_BUILD'] === 'e2e' ? 'e2e' : 'release'
}

/** The main process's BUILD_FLAVOUR: Forge builds in production mode when packaging, development under `pnpm dev`. */
export function buildFlavour(mode: string, env: Env): PackageFlavour | 'dev' {
  return mode === 'production' ? packageFlavour(env) : 'dev'
}
