import { createServerFn } from '@tanstack/react-start'
import { asActor, withActor } from '@/server/auth'
import { filesApi } from '@/server/composition'
import type { CreateUploadInput, DeleteFileInput, ListFilesInput } from '../types'

// The route table for metadata. The bytes go to the /api/files/$id server route.

export const listFiles = createServerFn({ method: 'GET' })
  .middleware([withActor])
  .validator((data: ListFilesInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => filesApi().list(actor, data)))

export const createUpload = createServerFn({ method: 'POST' })
  .middleware([withActor])
  .validator((data: CreateUploadInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => filesApi().createUpload(actor, data)))

export const deleteFile = createServerFn({ method: 'POST' })
  .middleware([withActor])
  .validator((data: DeleteFileInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => filesApi().remove(actor, data)))
