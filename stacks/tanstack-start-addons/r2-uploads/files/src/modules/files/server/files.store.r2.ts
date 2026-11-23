import type { FileStore } from './files.store'

/**
 * The R2 adapter. The body is piped through a FixedLengthStream of the declared size, which
 * gives R2 the known length it needs and fails the upload if the client sends more or less.
 */
export function r2FileStore(bucket: R2Bucket): FileStore {
  return {
    async put(key, body, { contentType, size }) {
      const sized = new FixedLengthStream(size)
      const piping = body.pipeTo(sized.writable)
      await Promise.all([bucket.put(key, sized.readable, { httpMetadata: { contentType } }), piping])
    },
    async get(key) {
      const object = await bucket.get(key)
      return object ? { body: object.body, size: object.size } : null
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}
