/** A stored object, ready to stream back. */
export interface StoredObject {
  body: ReadableStream<Uint8Array>
  size: number
}

/** The object storage port. Adapters: R2 (files.store.r2.ts) and memory (tests). */
export interface FileStore {
  /** Streams exactly `size` bytes into `key`; rejects if the stream is shorter or longer. */
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    meta: { contentType: string; size: number },
  ): Promise<void>
  get(key: string): Promise<StoredObject | null>
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>
}
