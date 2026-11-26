import { FuseState, FuseV1Options } from '@electron/fuses'

/** The release flavour's fuses. The e2e flavour differs only in EnableNodeCliInspectArguments. */
const RELEASE_FUSES: [FuseV1Options, FuseState][] = [
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
]

/** Lists every release fuse the packaged binary has wrong or lacks; empty means it passes. */
export function fuseProblems(wire: Partial<Record<FuseV1Options, FuseState>>): string[] {
  return RELEASE_FUSES.flatMap(([option, want]) => {
    const got = wire[option]
    if (got === want) return []
    const state = (value: FuseState | undefined) => (value === undefined ? 'missing' : FuseState[value])
    return [`${FuseV1Options[option]} is ${state(got)}, want ${state(want)}`]
  })
}
