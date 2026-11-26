// What `pnpm new:module` writes. A screen module copies the layout of renderer/modules/preferences:
// change the example first, then the template beside it.

/** A file the generator writes: its path from the repo root and its text. */
export interface GeneratedFile {
  path: string
  content: string
}

/** The kinds of module the generator makes. */
export const MODULE_KINDS = ['screen', 'main', 'adapter'] as const

/** One kind of module. */
export type ModuleKind = (typeof MODULE_KINDS)[number]

/** `todo-items` to `TodoItems`. */
export function pascal(name: string): string {
  return name.replace(/(^|-)([a-z0-9])/g, (_, _dash: string, letter: string) => letter.toUpperCase())
}

/** `todo-items` to `todoItems`. */
function camel(name: string): string {
  const p = pascal(name)
  return p.charAt(0).toLowerCase() + p.slice(1)
}

/**
 * A screen module that reads one command with no payload: the api, the query options and hook, the
 * section with its loading card, designed error state and content, its copy, and a test.
 */
export function screenModule(name: string, command: string): GeneratedFile[] {
  const P = pascal(name)
  const c = camel(name)
  const dir = `apps/desktop/src/renderer/modules/${name}`
  return [
    {
      path: `${dir}/copy.ts`,
      content: `/** Every string the ${name} module shows. */
export const ${copyName(name)} = {
  loading: 'Loading ${name}…',
  loadFailedTitle: '${P} couldn’t load',
  tryAgain: 'Try again',
} as const
`,
    },
    {
      path: `${dir}/api.ts`,
      content: `import type { CommandData } from '@app/contract/commands'

import { send } from '@/lib/app-api.ts'

/** Reads the ${name} from the engine (\`${command}\`). */
export function get${P}(): Promise<CommandData<'${command}'>> {
  return send('${command}')
}
`,
    },
    {
      path: `${dir}/hooks/${name}-queries.ts`,
      content: `import { queryOptions } from '@tanstack/react-query'

import { get${P} } from '../api.ts'

/** The ${name} query keys: one prefix, so a write can refresh every ${name} read. Export it then. */
const ${c}Keys = {
  all: ['${name}'] as const,
}

/** The one options function per read, so key and fetcher can't drift. */
export const ${c}Queries = {
  get: () => queryOptions({ queryKey: ${c}Keys.all, queryFn: get${P} }),
}
`,
    },
    {
      path: `${dir}/hooks/use-${name}.ts`,
      content: `import { useQuery } from '@tanstack/react-query'

import { ${c}Queries } from './${name}-queries.ts'

/** The ${name}, read through TanStack Query. */
export function use${P}() {
  return useQuery(${c}Queries.get())
}
`,
    },
    sectionFile(name, command),
    sectionTestFile(name),
  ]
}

const copyName = (name: string) => `${name.toUpperCase().replaceAll('-', '_')}_COPY`

function sectionFile(name: string, command: string): GeneratedFile {
  const P = pascal(name)
  const COPY = copyName(name)
  return {
    path: `apps/desktop/src/renderer/modules/${name}/ui/${name}-section.tsx`,
    content: `import type { CommandData } from '@app/contract/commands'

import { ErrorState } from '@/components/error-state.tsx'
import { Skeleton } from '@/components/skeleton.tsx'
import { Button } from '@/components/ui/button.tsx'
import { asCommandError } from '@/lib/app-api.ts'

import { ${COPY} } from '../copy.ts'
import { use${P} } from '../hooks/use-${name}.ts'

/** The loading card. Shape its bones like the content, so the content lands where they were. */
function ${P}Skeleton() {
  return (
    <div className="grid gap-4 rounded-r3 border border-line bg-surface p-6 shadow-hair">
      <p role="status" className="sr-only">
        {${COPY}.loading}
      </p>
      <Skeleton className="w-2/5" />
      <Skeleton className="w-3/5" />
    </div>
  )
}

/** The generator's starting content: it shows the data as it came. Swap in the module's own view. */
function ${P}Content({ data }: { data: CommandData<'${command}'> }) {
  return (
    <pre className="overflow-auto rounded-r3 border border-line bg-surface p-6 font-mono text-xs">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

/** The ${name} section: the loading card, the designed error with its reference ID and Try again, or the content. */
export function ${P}Section() {
  const query = use${P}()
  if (query.isPending || (query.isError && query.isFetching)) return <${P}Skeleton />
  if (query.isError) {
    const error = asCommandError(query.error)
    return (
      <ErrorState
        title={${COPY}.loadFailedTitle}
        message={error.message}
        referenceId={error.referenceId}
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            {${COPY}.tryAgain}
          </Button>
        }
      />
    )
  }
  return <${P}Content data={query.data} />
}
`,
  }
}

function sectionTestFile(name: string): GeneratedFile {
  const P = pascal(name)
  const COPY = copyName(name)
  return {
    path: `apps/desktop/src/renderer/modules/${name}/ui/${name}-section.test.ts`,
    content: `import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ${COPY} } from '../copy.ts'
import { ${P}Section } from './${name}-section.tsx'

describe('${P}Section', () => {
  it('shows the loading card, announced, before the engine answers', () => {
    const client = new QueryClient()
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(${P}Section)),
    )
    expect(html).toContain('role="status"')
    expect(html).toContain(${COPY}.loading)
  })
})
`,
  }
}

/** A main-process module: a factory main's composition root calls, and its test. */
export function mainModule(name: string): GeneratedFile[] {
  const P = pascal(name)
  const dir = `apps/desktop/src/main/modules/${name}`
  return [
    {
      path: `${dir}/${name}.ts`,
      content: `/** The ${name} module in main: OS work only. Main's composition root builds it (boundary rule 3). */
export function create${P}(): { name: string } {
  return { name: '${name} module' }
}
`,
    },
    {
      path: `${dir}/${name}.test.ts`,
      content: `import { describe, expect, it } from 'vitest'

import { create${P} } from './${name}'

describe('the ${name} module', () => {
  it('builds with its name', () => {
    expect(create${P}().name).toBe('${name} module')
  })
})
`,
    },
  ]
}

/** An engine adapter: one outside system (a program, a file format, an API) behind its own folder, and its test. */
export function adapterModule(name: string): GeneratedFile[] {
  const P = pascal(name)
  const dir = `packages/engine/src/adapters/${name}`
  return [
    {
      path: `${dir}/${name}.adapter.ts`,
      content: `/**
 * The ${name} adapter: one outside system. Only the engine's composition root builds it, and no other
 * module imports it (boundary rule 3). Only adapters may start a program (node:child_process).
 */
export function create${P}Adapter(): { name: string } {
  return { name: '${name} adapter' }
}
`,
    },
    {
      path: `${dir}/${name}.adapter.test.ts`,
      content: `import { describe, expect, it } from 'vitest'

import { create${P}Adapter } from './${name}.adapter.ts'

describe('the ${name} adapter', () => {
  it('builds with its name', () => {
    expect(create${P}Adapter().name).toBe('${name} adapter')
  })
})
`,
    },
  ]
}
