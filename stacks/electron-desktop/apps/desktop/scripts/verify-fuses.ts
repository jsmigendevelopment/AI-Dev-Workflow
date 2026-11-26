import { getCurrentFuseWire } from '@electron/fuses'

import { fuseProblems } from './fuses.ts'
import { packagedExecutable } from './packaged.ts'

// Read the fuses back out of the packaged release binary, not from forge.config.mts.
const binary = packagedExecutable('out')
const problems = fuseProblems(await getCurrentFuseWire(binary))
for (const problem of problems) process.stderr.write(`verify-fuses: ${problem}\n`)
process.stdout.write(`verify-fuses: ${problems.length === 0 ? 'passed' : 'FAILED'} (${binary})\n`)
process.exitCode = problems.length === 0 ? 0 : 1
