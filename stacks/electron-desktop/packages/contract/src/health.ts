import { z } from 'zod'

/** Which build is running: the packaged release, the packaged e2e flavour, or `pnpm dev`. */
export const buildFlavourSchema = z.enum(['release', 'e2e', 'dev'])

/** Which build is running. */
export type BuildFlavour = z.infer<typeof buildFlavourSchema>

/** What main tells the engine about the build when it starts it. */
export const buildInfoSchema = z.strictObject({
  version: z.string().min(1),
  commit: z.string().min(1),
  flavour: buildFlavourSchema,
})

/** What main tells the engine about the build. */
export type BuildInfo = z.infer<typeof buildInfoSchema>

/** `health.get`'s answer. Feeds Help > About and the smoke start. No secrets in it. */
export const healthSchema = z.strictObject({
  ...buildInfoSchema.shape,
  engine: z.literal('running'),
  data: z.strictObject({
    isOk: z.boolean(),
    folder: z.string(),
    // The SQLite driver built into Electron's Node, so no native module ships.
    driver: z.enum(['node:sqlite']),
  }),
})

/** `health.get`'s answer. */
export type Health = z.infer<typeof healthSchema>
