import type { Actor } from '@/lib/actor'
import { type ApiResult, unauthenticated } from '@/lib/app-error'
import { envelopeResponse, queryObject, readJson } from '@/lib/http'
import { respond } from '@/lib/respond'

import { renameNoteBody } from '../schemas'
import type { NotesController } from './notes.controller'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The `/api/v1/notes` HTTP controller, for clients that aren't this web app (mobile, desktop,
 * scripts). Request in, Response out; the same controller, service and repository as the server
 * functions, so the envelope, the strict schemas and the owner scoping are the same too.
 * The body cap and rate limit ran before this (src/server/request-guards.ts).
 */
export function notesHttp(controller: NotesController, actorOf: (request: Request) => Promise<Actor | null>) {
  async function signedIn(request: Request, run: (actor: Actor) => Promise<Response>): Promise<Response> {
    const actor = await actorOf(request)
    return actor ? run(actor) : envelopeResponse(unauthenticated())
  }

  async function withBody<T>(
    request: Request,
    run: (body: unknown) => Promise<ApiResult<T>>,
    okStatus = 200,
  ): Promise<Response> {
    const body = await readJson(request)
    return envelopeResponse(body.ok ? await run(body.data) : body, okStatus)
  }

  return {
    /** GET /api/v1/notes?cursor=&limit= → 200 Page<NoteDto> */
    list: (request: Request) =>
      signedIn(request, async (actor) =>
        envelopeResponse(await controller.list(actor, queryObject(new URL(request.url)))),
      ),

    /** POST /api/v1/notes { title } → 201 NoteDto */
    create: (request: Request) =>
      signedIn(request, (actor) => withBody(request, (body) => controller.create(actor, body), 201)),

    /** PATCH /api/v1/notes/:id { title } → 200 NoteDto. An id in the body is an unknown field. */
    rename: (request: Request, id: string) =>
      signedIn(request, (actor) =>
        withBody(request, async (body) => {
          const checked = await respond(renameNoteBody, body, async (b) => b)
          return checked.ok ? controller.rename(actor, { ...(isObject(body) ? body : {}), id }) : checked
        }),
      ),

    /** DELETE /api/v1/notes/:id → 200 { id } */
    remove: (request: Request, id: string) =>
      signedIn(request, async (actor) => envelopeResponse(await controller.remove(actor, { id }))),
  }
}
