import * as z from 'zod'
import type { Actor } from '@/lib/actor'
import { AppError, ERROR_STATUS, type ApiProblem } from '@/lib/app-error'
import { checkBody } from '@/lib/request-limits'
import { MAX_FILE_BYTES } from '../schemas'
import type { FilesService } from './files.service'

const problem = (status: number, error: ApiProblem) =>
  new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
const fail = (code: keyof typeof ERROR_STATUS, message: string) =>
  problem(ERROR_STATUS[code], { code, message })

function fromError(error: unknown): Response {
  if (error instanceof AppError) return problem(ERROR_STATUS[error.code], error.toProblem())
  console.error('unhandled', error)
  return fail('internal', 'Something went wrong. Try again.')
}

/**
 * A browser on this site sends `Sec-Fetch-Site: same-origin` and a matching Origin on PUT.
 * Server routes skip Start's CSRF middleware, so the upload route checks it here.
 */
function crossSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return true
  const origin = request.headers.get('origin')
  return origin !== null && origin !== new URL(request.url).origin
}

const fileId = z.uuid()

/** RFC 6266 filename*, so any name is safe in the header. */
const disposition = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}`

/**
 * The HTTP controller for the bytes. Server routes skip function middleware, so it resolves the
 * actor itself, and every cheap check (auth, origin, id, length) runs before the body is read.
 */
export const filesHttp = (service: FilesService, actorOf: () => Promise<Actor | null>) => ({
  async put(request: Request, id: string): Promise<Response> {
    if (crossSite(request)) return fail('forbidden', 'Cross-site uploads are not allowed.')
    const actor = await actorOf()
    if (!actor) return fail('unauthenticated', 'Sign in to continue.')
    if (!fileId.safeParse(id).success) return fail('not_found', 'That file does not exist.')
    // The request guards cap server functions and /api/v1 only: this route bounds its own body,
    // from the headers, before anything reads it (411 without a length, 413 over the cap).
    if (request.headers.get('content-length') === null)
      return problem(411, { code: 'validation', message: 'Send a Content-Length.' })
    const refused = checkBody(request, MAX_FILE_BYTES)
    if (refused) return refused
    const size = Number(request.headers.get('content-length'))
    if (!request.body || size === 0) return fail('validation', 'The file is empty.')
    const contentType = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    try {
      const file = await service.upload(actor, id, request.body, { contentType, size })
      return new Response(JSON.stringify({ ok: true, data: file }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    } catch (error) {
      return fromError(error)
    }
  },

  async get(_request: Request, id: string): Promise<Response> {
    const actor = await actorOf()
    if (!actor) return fail('unauthenticated', 'Sign in to continue.')
    if (!fileId.safeParse(id).success) return fail('not_found', 'That file does not exist.')
    try {
      const { file, object } = await service.download(actor, id)
      return new Response(object.body, {
        headers: {
          'content-type': file.type,
          'content-length': String(object.size),
          'content-disposition': disposition(file.name),
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox",
          'cache-control': 'private, no-store',
        },
      })
    } catch (error) {
      return fromError(error)
    }
  },
})

export type FilesHttp = ReturnType<typeof filesHttp>
