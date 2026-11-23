/** The result of trying to start a job. */
export type ClaimResult = 'claimed' | 'done' | 'busy'

/**
 * The ledger port. Each method is one atomic statement, so two Workers handling the same message
 * at once can't both claim it (D1 has no interactive transactions).
 */
export interface JobsRepository {
  /**
   * Start `id` unless it is done, or running with a start time at or after `staleBefore`.
   * A running row older than that belongs to a Worker that died, and is taken over.
   */
  claim(id: string, type: string, now: number, staleBefore: number): Promise<ClaimResult>
  complete(id: string, now: number): Promise<void>
  /** Forget a running claim after a failure, so the retry can claim it again. */
  release(id: string): Promise<void>
  /** Delete finished rows older than `before`. Returns how many. */
  pruneFinished(before: number): Promise<number>
}
