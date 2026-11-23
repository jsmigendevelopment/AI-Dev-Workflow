import { env } from 'cloudflare:workers'
import { createDb } from '@/db/client'
import { notesController } from '@/modules/notes/server/notes.controller'
import { drizzleNotesRepository } from '@/modules/notes/server/notes.repository.drizzle'
import { createNotesService } from '@/modules/notes/server/notes.service'

/**
 * The composition root: the only file that reads bindings and picks implementations.
 * Called inside a handler (never at module scope), so every request gets fresh, cheap objects.
 * Add one factory per module.
 */
export function notesApi() {
  const repo = drizzleNotesRepository(createDb(env.DB))
  const service = createNotesService({ repo, now: Date.now, newId: () => crypto.randomUUID() })
  return notesController(service)
}
