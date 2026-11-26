import { FuseState, FuseV1Options } from '@electron/fuses'
import { describe, expect, it } from 'vitest'

import { fuseProblems } from './fuses.ts'

// A wire the way @electron/fuses reads it from a packaged binary: option index -> state byte.
const release = {
  version: '1',
  [FuseV1Options.RunAsNode]: FuseState.DISABLE,
  [FuseV1Options.EnableCookieEncryption]: FuseState.ENABLE,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: FuseState.DISABLE,
  [FuseV1Options.EnableNodeCliInspectArguments]: FuseState.DISABLE,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: FuseState.ENABLE,
  [FuseV1Options.OnlyLoadAppFromAsar]: FuseState.ENABLE,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: FuseState.DISABLE,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: FuseState.DISABLE,
}

describe('verify-fuses', () => {
  it('WHEN the release fuses are all set THEN verify-fuses finds no problem', () => {
    expect(fuseProblems(release)).toEqual([])
  })

  it('WHEN any release fuse is loosened THEN verify-fuses names it', () => {
    const cases: [FuseV1Options, FuseState, string][] = [
      [FuseV1Options.RunAsNode, FuseState.ENABLE, 'RunAsNode'],
      [
        FuseV1Options.EnableNodeOptionsEnvironmentVariable,
        FuseState.ENABLE,
        'EnableNodeOptionsEnvironmentVariable',
      ],
      [FuseV1Options.EnableNodeCliInspectArguments, FuseState.ENABLE, 'EnableNodeCliInspectArguments'],
      [FuseV1Options.EnableCookieEncryption, FuseState.DISABLE, 'EnableCookieEncryption'],
      [
        FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
        FuseState.DISABLE,
        'EnableEmbeddedAsarIntegrityValidation',
      ],
      [FuseV1Options.OnlyLoadAppFromAsar, FuseState.DISABLE, 'OnlyLoadAppFromAsar'],
      [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.ENABLE, 'GrantFileProtocolExtraPrivileges'],
    ]
    for (const [option, state, name] of cases) {
      const problems = fuseProblems({ ...release, [option]: state })
      expect(problems, name).toHaveLength(1)
      expect(problems[0]).toContain(name)
    }
  })

  it('WHEN a fuse is missing from the binary THEN verify-fuses fails', () => {
    const missing = String(FuseV1Options.OnlyLoadAppFromAsar)
    const wire = Object.fromEntries(Object.entries(release).filter(([option]) => option !== missing))
    expect(fuseProblems(wire)).toEqual([expect.stringContaining('OnlyLoadAppFromAsar')])
  })
})
