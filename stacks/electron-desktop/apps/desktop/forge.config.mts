import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig } from '@electron-forge/shared-types'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { APP_NAME } from '@app/contract/app'

import { packageFlavour } from './scripts/flavour.ts'

// Forge 8's Vite template, moved into main/, preload/ and renderer/. The Windows zip can be cross-built
// on Linux (`pnpm build:win-zip`); Squirrel is for a release made with `pnpm make` on Windows. No publisher.
// Two flavours (the pack's "Why two flavours"): release by default, and e2e when APP_BUILD=e2e.
// They differ in one fuse and the output folder; e2e is never released.
const flavour = packageFlavour(process.env)

const config: ForgeConfig = {
  outDir: flavour === 'e2e' ? 'out-e2e' : 'out',
  packagerConfig: {
    asar: true,
    name: APP_NAME,
    executableName: APP_NAME,
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ['win32']), new MakerSquirrel({ name: APP_NAME })],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.mts', target: 'main' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.mts', target: 'preload' },
        // The engine's own process: main starts .vite/build/engine-process.cjs with utilityProcess.
        {
          entry: '../../packages/engine/src/engine-process.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }],
    }),
    // Release fuses: no running as plain Node, no inspector, app code only from the asar, and no extra
    // file:// powers (the page loads from app://). scripts/verify-fuses.ts checks them after packaging.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      // Playwright attaches with --inspect=0, so only the e2e flavour keeps this on.
      [FuseV1Options.EnableNodeCliInspectArguments]: flavour === 'e2e',
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
}

export default config
