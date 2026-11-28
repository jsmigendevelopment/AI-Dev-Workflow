import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The routing, store and SSR rules in eslint.config.js and eslint-rules.js, each proved on a
// deliberate violation through the real config (a rule that never fires passes silently). The
// probes are text, not files, so the type-aware rules are off: these rules read syntax only.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: tseslint.configs.disableTypeChecked })

async function rulesHit(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`)
}

const SYNTAX = 'no-restricted-syntax'

describe('lint: links and navigation stay type-safe', () => {
  const file = 'src/components/lint-probe.tsx'
  const component = (body: string) =>
    `import { Link, useNavigate } from '@tanstack/react-router'\n\nexport function Probe({ id }: { id: string }) {\n  const navigate = useNavigate()\n  void navigate\n  void Link\n  void id\n  return ${body}\n}\n`

  it.each([
    ['a raw internal <a href>', '<a href="/notes">Notes</a>'],
    ['an <a href> built from a template', '<a href={`/notes/${id}`}>Note</a>'],
    ['a Link to a string-built path', '<Link to={`/notes/${id}`}>Note</Link>'],
    ['a Link to a concatenated path', "<Link to={'/notes/' + id}>Note</Link>"],
  ])('refuses %s', async (_, jsx) => {
    expect((await rulesHit(component(jsx), file)).some((m) => m.startsWith(SYNTAX))).toBe(true)
  })

  it('refuses navigate() with a string or a string-built `to`', async () => {
    for (const call of ["navigate('/notes')", 'navigate({ to: `/notes/${id}` })'])
      expect(
        (await rulesHit(component(`(void ${call}, null)`), file)).some((m) => m.startsWith(SYNTAX)),
      ).toBe(true)
  })

  it('allows typed links, external links, anchors and object navigation', async () => {
    const ok = component(
      '<>\n<Link to="/notes/$noteId" params={{ noteId: id }}>Note</Link>\n<a href="https://example.com">Out</a>\n<a href="#main">Skip</a>\n<button onClick={() => void navigate({ to: "/notes" })}>Go</button>\n</>',
    )
    expect((await rulesHit(ok, file)).filter((m) => m.startsWith(SYNTAX))).toEqual([])
  })
})

describe('lint: a Zustand store never holds server data', () => {
  it.each([
    ["import { useQuery } from '@tanstack/react-query'", 'src/stores/probe-store.ts'],
    ["import { useNotesList } from '@/modules/notes/hooks/use-notes'", 'src/stores/probe-store.ts'],
    ["import type { NoteDto } from '@/modules/notes/types'", 'src/stores/probe-store.ts'],
    ["import type { NoteDto } from '../types'", 'src/modules/notes/stores/probe-store.ts'],
    ["import { listNotes } from '../server/notes.functions'", 'src/modules/notes/stores/probe-store.ts'],
  ])('refuses %s in %s', async (line, file) => {
    const hits = await rulesHit(`${line}\n\nexport const probe = 1\n`, file)
    expect(hits.some((m) => m.startsWith('no-restricted-imports'))).toBe(true)
  })

  it('allows client-only imports in a store', async () => {
    const hits = await rulesHit(
      "import { cn } from '@/lib/utils'\n\nexport const probe = cn\n",
      'src/stores/probe-store.ts',
    )
    expect(hits.filter((m) => m.startsWith('no-restricted-imports'))).toEqual([])
  })
})

describe('lint: a route that is not fully server-rendered says why', () => {
  const route = (option: string) =>
    `import { createFileRoute } from '@tanstack/react-router'\n\nexport const Route = createFileRoute('/probe')({\n${option}\n})\n`
  const file = 'src/routes/probe.tsx'

  it('refuses ssr: false or data-only with no reason, and a redundant ssr: true', async () => {
    for (const option of ['  ssr: false,', "  ssr: 'data-only',", '  ssr: true,'])
      expect((await rulesHit(route(option), file)).some((m) => m.startsWith('local/ssr-needs-reason'))).toBe(
        true,
      )
  })

  it('accepts ssr: false with a reason above it', async () => {
    const hits = await rulesHit(route('  // ssr: the canvas editor needs window.\n  ssr: false,'), file)
    expect(hits.filter((m) => m.startsWith('local/ssr-needs-reason'))).toEqual([])
  })
})

// "Compose, don't couple" (#92): a controller composes services, a service composes
// repositories. The boundary check needs imports that resolve, so each probe sits in the real
// notes server folder and imports a file that exists there.
describe('lint: services and repositories do not import their own kind', () => {
  const dir = 'src/modules/notes/server'
  const boundaryHits = async (code: string, file: string) =>
    (await rulesHit(code, `${dir}/${file}`)).filter((m) => m.startsWith('boundaries/dependencies'))

  const port = "import type { NotesRepository } from './notes.repository'\n"
  const service = "import type { NotesService } from './notes.service'\n"

  it('AC-707-1: refuses a service importing another service, and says a controller composes them', async () => {
    const hits = await boundaryHits(service, 'tags.service.ts')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('a controller composes services')
  })

  it.each([
    ['a port into a port of another name', port, 'tags.repository.ts'],
    [
      'an adapter into a port of another name',
      "import { drizzleNotesRepository } from './notes.repository.drizzle'\n",
      'tags.repository.ts',
    ],
    [
      'a memory fake into a Drizzle adapter',
      "import { drizzleNotesRepository } from './notes.repository.drizzle'\n",
      'notes.repository.memory.ts',
    ],
    ['a Drizzle adapter into a port of another name', port, 'tags.repository.drizzle.ts'],
    ['a memory fake into a port of another name', port, 'tags.repository.memory.ts'],
    [
      'a port into its own memory fake',
      "import { memoryNotesRepository } from './notes.repository.memory'\n",
      'notes.repository.ts',
    ],
  ])('AC-707-2: refuses a repository importing a repository: %s', async (_, code, file) => {
    const hits = await boundaryHits(code, file)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('a service composes repositories')
  })

  it.each([
    ['a Drizzle adapter imports its own port', port, 'notes.repository.drizzle.ts'],
    ['a memory fake imports its own port', port, 'notes.repository.memory.ts'],
    ['a service imports a repository port', port, 'tags.service.ts'],
    ['a controller imports a service', service, 'tags.controller.ts'],
    ['a service test imports its service', service, 'tags.service.test.ts'],
  ])('AC-707-3: allows it when %s', async (_, code, file) => {
    expect(await boundaryHits(code, file)).toEqual([])
  })
})

// An adapter may import its own port, in its own module only. A second module needs a real
// `*.repository.ts` for the import to resolve, so the test writes one and removes it after.
describe('lint: an adapter reaches its own port, never the same-named port of another module', () => {
  const other = 'src/modules/lint-probe-other/server'

  beforeAll(() => {
    mkdirSync(other, { recursive: true })
    writeFileSync(`${other}/notes.repository.ts`, 'export type OtherNotesRepository = never\n')
  })
  afterAll(() => rmSync('src/modules/lint-probe-other', { recursive: true, force: true }))

  it.each(['notes.repository.drizzle.ts', 'notes.repository.memory.ts'])(
    'AC-707-5: refuses %s importing a port of the same name in another module',
    async (file) => {
      const code =
        "import type { OtherNotesRepository } from '@/modules/lint-probe-other/server/notes.repository'\n"
      const hits = (await rulesHit(code, `src/modules/notes/server/${file}`)).filter((m) =>
        m.startsWith('boundaries/dependencies'),
      )
      expect(hits).toHaveLength(1)
    },
  )
})
