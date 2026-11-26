import comments from '@eslint-community/eslint-plugin-eslint-comments'
import js from '@eslint/js'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import boundaries from 'eslint-plugin-boundaries'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// The boundary check. Elements are the workspace's parts; every import between them must match a
// policy below, or lint fails. Rules 1 to 3 are boundary policies; rule 4, the layer rule, and the rest
// of rule 2 are plain ESLint rules in layerConfigs. tests/boundaries.test.ts proves each one on a bad import.
// Each module folder is its own element, listed first so it wins over the part that holds it.
const MODULES = [
  { type: 'main-module', pattern: 'apps/desktop/src/main/modules/*' },
  { type: 'renderer-module', pattern: 'apps/desktop/src/renderer/modules/*' },
  { type: 'engine-module', pattern: 'packages/engine/src/modules/*' },
  { type: 'engine-module', pattern: 'packages/engine/src/adapters/*' },
]
const MODULE_TYPES = [...new Set(MODULES.map((m) => m.type))]
const elements = [
  ...MODULES,
  { type: 'main', pattern: 'apps/desktop/src/main' },
  { type: 'preload', pattern: 'apps/desktop/src/preload' },
  { type: 'renderer', pattern: 'apps/desktop/src/renderer' },
  { type: 'contract', pattern: 'packages/contract' },
  { type: 'engine', pattern: 'packages/engine' },
].map((e) => ({ ...e, partialMatch: true }))

// A part's name stands for the part and its modules, so every rule below covers both.
const withModules = (types) => types.flatMap((type) => [type, `${type}-module`])
const el = (types) => ({ to: { element: { types: withModules(types) } } })
const from = (type) => ({ element: { type: withModules([type]) } })
const electron = { to: { module: { origin: 'external', source: ['electron', 'electron/**'] } } }
const nodeCore = { to: { module: { origin: 'core' } } }

const PROCESS_RULE =
  'Process rule: the screen (renderer/) imports only renderer/ and packages/contract, never electron or node:*. ' +
  'preload/ imports only packages/contract and electron. main/ never imports renderer/ or preload/.'
const ENGINE_RULE = 'Engine rule: packages/engine never imports electron or anything in apps/.'
const MODULE_RULE =
  'Module rule: a module in the screen, main or the engine never imports another module. ' +
  'The routes and the composition roots wire them; shared code lives outside modules/.'

const boundaryPolicies = [
  // Packages, and files inside the same element, are allowed. The rules below narrow both.
  { allow: { to: { module: { origin: ['external', 'core'] } } } },
  { allow: { dependency: { relationship: { to: 'internal' } } } },
  { from: from('main'), allow: el(['main', 'contract', 'engine']) },
  { from: { element: { type: 'preload' } }, allow: el(['preload', 'contract']) },
  { from: from('renderer'), allow: el(['renderer', 'contract']) },
  { from: from('engine'), allow: el(['engine', 'contract']) },
  { from: { element: { type: 'contract' } }, allow: el(['contract']) },
  // Rule 1, the process rule. It keeps Node out of the page, so it is also a security check.
  {
    from: from('renderer'),
    disallow: [electron, nodeCore, el(['main', 'preload', 'engine'])],
    message: PROCESS_RULE,
  },
  {
    from: { element: { type: 'preload' } },
    disallow: [
      nodeCore,
      { to: { module: { origin: 'external', source: '!{electron,electron/**}' } } },
      el(['main', 'renderer', 'engine']),
    ],
    message: PROCESS_RULE,
  },
  { from: from('main'), disallow: el(['renderer', 'preload']), message: PROCESS_RULE },
  // Rule 2, the engine rule: the engine runs without Electron, so it can move behind another shell later.
  {
    from: from('engine'),
    disallow: [electron, el(['main', 'preload', 'renderer'])],
    message: ENGINE_RULE,
  },
  // Rule 3, the module rule: a module may use its own files and shared code, never another module.
  // A later policy wins, so the second line lets a module's files import each other again.
  {
    from: { element: { type: MODULE_TYPES } },
    disallow: { to: { element: { types: MODULE_TYPES } } },
    message: MODULE_RULE,
  },
  { allow: { dependency: { relationship: { to: 'internal' } } } },
]

// Rule 4, the layer rule, and the rest of rule 2: plain ESLint rules scoped by file, since they key on
// file names (*.service.ts, adapters/, ipc/register.ts) rather than on the workspace's parts.
const LAYER_RULE =
  'Layer rule: a *.service.ts never imports electron, node:fs, node:child_process, node:net or a native module. ' +
  'It gets adapters and repositories through its constructor.'
const SPAWN_RULE =
  'Engine rule: only engine adapters (packages/engine/src/adapters/) may import node:child_process.'
const SQLITE_RULE = 'Engine rule: only packages/engine/src/db/ imports the SQLite driver.'
const IPC_RULE =
  'IPC rule: main/ipc/register.ts is the only place that listens on ipcMain; it checks the sender and the schema.'

const CHILD_PROCESS = ['node:child_process', 'child_process']
const SQLITE = ['node:sqlite', 'better-sqlite3']
const SERVICE_BANNED = [
  'electron',
  'node:fs',
  'fs',
  'node:fs/promises',
  'fs/promises',
  ...CHILD_PROCESS,
  'node:net',
  'net',
]
// A later block replaces an earlier block's list for the same file, so each list is whole.
const restrictImports = (...groups) => [
  'error',
  { paths: groups.flatMap(([names, message]) => names.map((name) => ({ name, message }))) },
]
const DB = 'packages/engine/src/db/**'

const layerConfigs = [
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.ts'],
    ignores: [DB],
    rules: { 'no-restricted-imports': restrictImports([SQLITE, SQLITE_RULE]) },
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['packages/engine/src/adapters/**', DB],
    rules: {
      'no-restricted-imports': restrictImports([CHILD_PROCESS, SPAWN_RULE], [SQLITE, SQLITE_RULE]),
    },
  },
  {
    files: [DB],
    rules: { 'no-restricted-imports': restrictImports([CHILD_PROCESS, SPAWN_RULE]) },
  },
  {
    // After the engine blocks, so a service gets the wider list.
    files: ['**/*.service.ts'],
    rules: {
      'no-restricted-imports': restrictImports([SERVICE_BANNED, LAYER_RULE], [SQLITE, SQLITE_RULE]),
    },
  },
  {
    files: ['apps/desktop/src/**/*.ts'],
    ignores: ['apps/desktop/src/main/ipc/register.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['handle', 'handleOnce', 'on', 'once'].map((property) => ({
          object: 'ipcMain',
          property,
          message: IPC_RULE,
        })),
      ],
    },
  },
]

// A second copy of the core max-lines rule, so one file can warn at 300 and fail at 500.
const size = { rules: { 'max-lines-soft': builtinRules.get('max-lines') } }

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/out',
      '**/out-e2e',
      '**/.vite',
      '**/coverage',
      '**/lint-fixtures/**',
      '.agents',
      '.claude',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: { globals: { ...globals.node } },
    plugins: { '@eslint-community/eslint-comments': comments, size },
    rules: {
      // An exception says why: `// eslint-disable-next-line <rule> -- <reason> (#123)`.
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: ['eslint-enable'] }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      'no-console': 'error',
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'size/max-lines-soft': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'all' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TSAsExpression[expression.type="TSAsExpression"][expression.typeAnnotation.type="TSUnknownKeyword"]',
          message: '`as unknown as` turns the checker off. Fix the type, or parse the value with zod.',
        },
      ],
    },
  },
  {
    files: ['apps/desktop/src/renderer/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: {
          noWarnOnMultipleProjects: true,
          project: [
            'apps/desktop/tsconfig.main.json',
            'apps/desktop/tsconfig.preload.json',
            'apps/desktop/tsconfig.renderer.json',
            'packages/*/tsconfig.json',
          ],
        },
      },
      'boundaries/elements': elements,
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          // Also check packages and imports inside one element, or the plugin skips them.
          checkAllOrigins: true,
          checkInternals: true,
          policies: boundaryPolicies,
        },
      ],
    },
  },
  ...layerConfigs,
  {
    // A describe block is a list of cases, not a function to split.
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'max-lines-per-function': 'off' },
  },
)
