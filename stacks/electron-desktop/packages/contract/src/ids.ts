import { v7 } from 'uuid'

/**
 * A new UUIDv7: time-ordered, so IDs made one after another sort in creation order. The screen makes
 * command IDs with it and the engine its row IDs; it lives in the contract so both sides share one.
 */
export function newId(): string {
  return v7()
}
