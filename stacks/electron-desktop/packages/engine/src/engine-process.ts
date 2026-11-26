import { homedir } from 'node:os'

import { commandEnvelopeSchema } from '@app/contract/envelope'
import { buildInfoSchema } from '@app/contract/health'

import { createEngine } from './composition.ts'
import { resolveDataDir } from './lib/data-dir.ts'
import { systemClock } from './lib/time.ts'

// The entry Electron's utilityProcess runs. Electron puts `parentPort` on `process`; the engine never
// imports electron, so the shape it uses is written out here.
interface ParentPort {
  on(event: 'message', listener: (message: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

const port = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort
if (!port) throw new Error('engine-process must run in an Electron utilityProcess')

// Main passes the build as the last argument, in JSON.
const build = buildInfoSchema.parse(JSON.parse(process.argv.at(-1) ?? ''))
const engine = createEngine({ build, dataDir: resolveDataDir(process.env, homedir()), clock: systemClock })

// Events go to main on the same port as answers; main tells them apart by their shape.
engine.onEvent((event) => port.postMessage(event))

port.on('message', ({ data }) => {
  const command = commandEnvelopeSchema.safeParse(data)
  // Main only sends checked envelopes; anything else has no ID to answer, so it is dropped.
  if (!command.success) return
  void engine.handle(command.data).then((result) => port.postMessage(result))
})
