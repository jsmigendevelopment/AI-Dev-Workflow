// A route file for a module's view, the route tree regenerated, and the page added to the e2e
// route list (so axe and the screenshot tests cover it). Used by new:route and new:module.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { camel, edit, fail, human, kebab, moduleDir, pascal, render, template, type Tokens } from './lib.ts'

const ROUTES_LIST = 'e2e/helpers.ts'

/** `settings/profile` or `/settings/profile` → its segments, each kebab-case. */
export function routeSegments(path: string | undefined): string[] {
  const segments = (path ?? '').replace(/^\/+|\/+$/g, '').split('/')
  segments.forEach((s) => kebab(s, 'Each part of the path'))
  return segments
}

/** The files for one page: the route, and the view when the module doesn't have it yet. */
export function pageFiles(path: string, mod: string): [string, string][] {
  const segments = routeSegments(path)
  const last = segments.at(-1) ?? mod
  const url = `/${segments.join('/')}`
  const routeFile = join('src/routes', `${segments.join('/')}.tsx`)
  if (existsSync(routeFile)) fail(`${routeFile} already exists.`)
  const viewName = `${last}-view`
  const viewFile = join(moduleDir(mod), 'ui/views', `${viewName}.tsx`)
  const hooks = join(moduleDir(mod), 'hooks', `use-${mod}.ts`)
  // Preload the module's list when this is the module's own page and the module has one.
  const preload =
    last === mod &&
    existsSync(hooks) &&
    readFileSync(hooks, 'utf8').includes(`export const ${camel(mod)}Queries`)
  const title = human(last).replace(/^./, (c) => c.toUpperCase())
  const tokens: Tokens = {
    __LOADER_IMPORT__: preload
      ? `import { ${camel(mod)}Queries } from '@/modules/${mod}/hooks/use-${mod}'\n`
      : '',
    __LOADER__: preload
      ? `  loader: ({ context }) => context.queryClient.query(${camel(mod)}Queries.list()).catch(() => undefined),\n`
      : '',
    __View__: `${pascal(last)}View`,
    __view__: viewName,
    __mod__: mod,
    __path__: url,
    __title__: title,
    __description__: `${title}, kept private.`,
  }
  const files: [string, string][] = [[routeFile, render(template('parts/route.tsx.tpl'), tokens)]]
  if (!existsSync(viewFile)) files.push([viewFile, render(template('parts/view.tsx.tpl'), tokens)])
  return files
}

/** Adds the page to the e2e route list. */
export function addToE2eRoutes(path: string) {
  const url = `/${routeSegments(path).join('/')}`
  edit(ROUTES_LIST, (text) =>
    text.includes(`'${url}'`)
      ? text
      : text.replace(/(export const ROUTES = \[[^\]]*?)('\/this-page-does-not-exist')/, `$1'${url}', $2`),
  )
  return ROUTES_LIST
}
