import type { FileStore } from './files.store'

/** The test fake. Enforces the declared size, as the R2 adapter does. */
export function memoryFileStore() {
  const objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; contentType: string }>()
  const store: FileStore = {
    async put(key, body, { contentType, size }) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer())
      if (bytes.byteLength !== size) throw new Error(`expected ${size} bytes, got ${bytes.byteLength}`)
      objects.set(key, { bytes, contentType })
    },
    async get(key) {
      const object = objects.get(key)
      return object ? { body: new Response(object.bytes).body!, size: object.bytes.byteLength } : null
    },
    async delete(key) {
      objects.delete(key)
    },
  }
  return { store, objects }
}
