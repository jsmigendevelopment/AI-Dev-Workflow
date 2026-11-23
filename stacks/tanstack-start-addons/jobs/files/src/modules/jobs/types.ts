import type * as z from 'zod'
import type { jobMessage } from './schemas'

export type JobMessage = z.output<typeof jobMessage>

/** What happened to one delivery. */
export type RunOutcome = 'done' | 'duplicate' | 'busy' | 'unknown'
