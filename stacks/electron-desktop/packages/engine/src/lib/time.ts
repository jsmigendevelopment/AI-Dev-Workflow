/** Where the engine reads the current instant. Injected, so tests can fix the time. */
export type Clock = () => Date

/** The real clock. */
export const systemClock: Clock = () => new Date()

/** The instant's calendar day in UTC, as `YYYY-MM-DD`. */
export function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10)
}
