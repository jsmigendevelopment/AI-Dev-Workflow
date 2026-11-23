import type { SearchSchemaInput } from '@tanstack/react-router'

// The route-level parsers: /notes's search params and /notes/$noteId's params. Routes run these
// on every match, so they ship in the entry chunk with the route tree, on every page. They are
// plain functions, not Zod: a schema library there costs every page about 10 KB gzip. The server
// still checks every input with the full Zod schemas (schemas.ts).

/** The list orders, shared with the server's input schema (schemas.ts). */
export const NOTE_SORTS = ['newest', 'oldest'] as const
type NoteSort = (typeof NOTE_SORTS)[number]

/** The same limit as `noteFilter` in schemas.ts. */
const MAX_FILTER = 100
/** How many pages a link may ask the loader for. */
const MAX_PAGE = 10

/** The /notes search params, after parsing. */
export interface NotesSearch {
  q?: string | undefined
  sort: NoteSort
  page: number
}

const isSort = (value: unknown): value is NoteSort => NOTE_SORTS.some((sort) => sort === value)

function parseFilter(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text && text.length <= MAX_FILTER ? text : undefined
}

function parsePage(value: unknown): number {
  const page = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1
}

/**
 * The /notes URL: `?q=milk&sort=oldest&page=2`. A bad value falls back to its default instead of
 * failing the page, so an old or hand-edited link still opens. `page` is how many pages of the
 * list are shown, capped so a link can't make the loader fetch an unbounded list. Links may leave
 * any field out (the input type), and readers always get all three (the result).
 */
export function parseNotesSearch(
  raw: { q?: string | undefined; sort?: NoteSort | undefined; page?: number | undefined } & SearchSchemaInput,
): NotesSearch {
  // The URL can hold anything: read each field as unknown, whatever the input type says.
  const input: Record<string, unknown> = raw
  return {
    q: parseFilter(input.q),
    sort: isSort(input.sort) ? input.sort : 'newest',
    page: parsePage(input.page),
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** `/notes/$noteId`: anything but a UUID is not a note, so the route doesn't match (a 404). */
export const parseNoteParams = ({ noteId }: { noteId: string }) => (UUID.test(noteId) ? { noteId } : false)
