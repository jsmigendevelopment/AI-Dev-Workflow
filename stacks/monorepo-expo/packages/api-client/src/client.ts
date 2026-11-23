import * as contracts from '@repo/contracts'
import type * as z from 'zod'
import { ApiError, codeForStatus } from './api-error'

export interface ApiClientOptions {
  /** The web app's origin, for example https://app.example.com. Undefined: every call fails closed. */
  baseUrl: string | undefined
  /** A fresh Clerk session token per call (Clerk refreshes it). Null when signed out. */
  getToken: () => Promise<string | null>
  /** Injected in tests. Defaults to the global fetch. */
  fetch?: typeof fetch
}

interface Call {
  method: string
  path: string
  query?: object
  body?: unknown
  signal?: AbortSignal | undefined
}

const MESSAGES = {
  noServer: 'The app is not connected to a server yet.',
  signIn: 'Sign in to continue.',
  offline: 'Could not reach the server. Check your connection.',
  unknown: 'Something went wrong. Try again.',
} as const

const queryString = (query: object = {}): string => {
  const parts = Object.entries(query as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError'

/**
 * A typed client for /api/v1. Every method resolves to the data or throws an ApiError, never
 * anything else (aborts pass through). It never retries: the caller (TanStack Query) decides.
 * Signed out or no server configured → it fails before touching the network.
 */
export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  async function request<S extends z.ZodType>(data: S, call: Call): Promise<z.output<S>> {
    if (!options.baseUrl) throw new ApiError('unavailable', MESSAGES.noServer)
    const token = await options.getToken()
    if (!token) throw new ApiError('unauthenticated', MESSAGES.signIn)

    const url = `${options.baseUrl.replace(/\/+$/, '')}${call.path}${queryString(call.query)}`
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` }
    if (call.body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await doFetch(url, {
        method: call.method,
        headers,
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        signal: call.signal,
      })
    } catch (error) {
      if (isAbort(error)) throw error
      throw new ApiError('unavailable', MESSAGES.offline)
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new ApiError(codeForStatus(response.status), MESSAGES.unknown, undefined, response.status)
    }
    const envelope = contracts.apiResult(data).safeParse(json)
    if (!envelope.success) {
      throw new ApiError(
        codeForStatus(response.ok ? 500 : response.status),
        MESSAGES.unknown,
        undefined,
        response.status,
      )
    }
    const result = envelope.data as contracts.ApiResult<z.output<S>>
    if (result.ok) return result.data
    throw new ApiError(result.error.code, result.error.message, result.error.fields, response.status)
  }

  const { notes } = contracts.routes
  return {
    notes: {
      list: (query: contracts.ListNotesQuery = {}, signal?: AbortSignal) =>
        request(contracts.notesPage, { ...notes.list, query, signal }),
      create: (body: contracts.CreateNoteBody) => request(contracts.noteDto, { ...notes.create, body }),
      rename: (id: string, body: contracts.RenameNoteBody) =>
        request(contracts.noteDto, {
          ...notes.rename,
          path: contracts.pathFor(notes.rename.path, { id }),
          body,
        }),
      remove: (id: string) =>
        request(contracts.deletedNote, {
          ...notes.remove,
          path: contracts.pathFor(notes.remove.path, { id }),
        }),
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
