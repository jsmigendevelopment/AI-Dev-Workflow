import js from '@eslint/js'
import comments from '@eslint-community/eslint-plugin-eslint-comments'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import tailwind from 'eslint-plugin-better-tailwindcss'
import boundaries from 'eslint-plugin-boundaries'
import checkFile from 'eslint-plugin-check-file'
import reactHooks from 'eslint-plugin-react-hooks'
import importSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

import local, { routing, storeImports } from './eslint-rules.js'

// The module boundary check. Elements are the folders in docs/architecture.md; every import
// between them must match a policy below, or lint fails.
const elements = [
  { type: 'routes', pattern: 'src/routes' },
  { type: 'module', pattern: 'src/modules/*', capture: ['module'] },
  { type: 'app-server', pattern: 'src/server' },
  { type: 'ui-kit', pattern: 'src/components/ui' },
  { type: 'components', pattern: 'src/components' },
  { type: 'hooks', pattern: 'src/hooks' },
  { type: 'lib', pattern: 'src/lib' },
  { type: 'db', pattern: 'src/db' },
  // Everything else directly in src/: router.tsx, start.ts, styles.css, the generated route tree.
  { type: 'app', pattern: 'src' },
].map((e) => ({ ...e, partialMatch: false }))

const files = [
  { category: 'service', pattern: 'src/modules/*/server/*.service.ts' },
  { category: 'server-functions', pattern: 'src/modules/*/server/*.functions.ts' },
  { category: 'adapter', pattern: 'src/modules/*/server/*.{repository.drizzle,table}.ts' },
  {
    category: 'server-internal',
    pattern: 'src/modules/*/server/*.{controller,service,repository,table,http}.ts',
  },
  { category: 'server-internal', pattern: 'src/modules/*/server/*.repository.{drizzle,memory}.ts' },
  { category: 'client', pattern: 'src/modules/*/{ui,hooks}/**' },
  { category: 'test', pattern: '**/*.test.{ts,tsx}' },
]

const shared = ['components', 'ui-kit', 'hooks', 'lib', 'db']
const el = (types) => ({ to: { element: { types } } })

// Packages a service may never import: it holds rules, not SQL, HTTP or an SDK.
const notInServices = [
  'drizzle-orm',
  'drizzle-orm/**',
  '@tanstack/react-start',
  '@tanstack/react-start/**',
  '@clerk/**',
  'cloudflare:*',
  'wrangler',
]

// The code style (guide/code-style.md in the kit), as rules. An exception is a comment with a
// reason and an issue number: `// eslint-disable-next-line <rule> -- <reason> (#123)`.
const restrictedSyntax = [
  {
    selector:
      'TSAsExpression[expression.type="TSAsExpression"][expression.typeAnnotation.type="TSUnknownKeyword"]',
    message: '`as unknown as` turns the checker off. Fix the type, or parse the value with Zod.',
  },
]
// Code outside src/ (scripts, e2e) may reach into it: the alias only covers src/.
const deepRelative = {
  regex: '^\\.\\./\\.\\./(?!(?:\\.\\./)*(?:scripts|e2e)/)',
  message: 'Use the @/ alias instead of a deep relative path.',
}
// Colours come from the design tokens. These files hold the tokens, so they may spell colours.
// (src/styles.css is the main token file; ESLint doesn't read CSS.)
const TOKEN_FILES = ['src/lib/site.ts', 'src/lib/plain-page.ts']
const rawColour = [
  {
    selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message: 'A raw colour. Use a design token (src/styles.css) instead.',
  },
  {
    selector: 'Literal[value=/\\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\\(/]',
    message: 'A raw colour. Use a design token (src/styles.css) instead.',
  },
]
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white'
// A second copy of the core max-lines rule, so one file can warn at 300 and fail at 500.
const size = { rules: { 'max-lines-soft': builtinRules.get('max-lines') } }

export default tseslint.config(
  {
    ignores: [
      'dist',
      '.wrangler',
      'node_modules',
      'playwright-report',
      'test-results',
      '.lighthouseci',
      'src/routeTree.gen.ts',
      'worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // Type-aware rules through the project service: each file gets its own tsconfig (see
    // tsconfig.json), so a pre-commit run on a few files stays quick.
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: {
      '@eslint-community/eslint-comments': comments,
      local,
      size,
      'simple-import-sort': importSort,
      'check-file': checkFile,
    },
    rules: {
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: ['eslint-enable'] }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      'local/exception-needs-issue': 'error',
      'local/todo-needs-issue': 'error',
      'no-console': 'error',
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'size/max-lines-soft': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 15],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [deepRelative],
        },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'check-file/filename-naming-convention': [
        'error',
        { '{src,scripts,e2e}/**/*.{ts,tsx,js,mjs}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': ['error', { '{src,scripts,e2e}/**/': 'KEBAB_CASE' }],
      'check-file/no-index': [
        'error',
        { errorMessage: 'No barrel files: import from the file itself (app-conventions rule 4).' },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'all' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // An async fake or adapter that happens not to await still honours a Promise port.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // The router's own control flow: `throw notFound()` and `throw redirect()` in loaders.
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [{ from: 'package', package: '@tanstack/router-core', name: ['NotFoundError', 'Redirect'] }],
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: false },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          'ts-expect-error': { descriptionFormat: '^ -- .+\\(#\\d+\\)$' },
          minimumDescriptionLength: 10,
        },
      ],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },
  {
    files: TOKEN_FILES,
    rules: { 'no-restricted-syntax': ['error', ...restrictedSyntax, ...routing] },
  },
  {
    // Classes: tokens only. No arbitrary values (`mt-[13px]`) and no palette colours (`bg-blue-500`).
    // The shadcn/ui primitives are vendored from the UI kit and keep its own classes.
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    plugins: { 'better-tailwindcss': tailwind },
    rules: {
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              pattern: '(?:^|:)!?-?[a-z][a-z0-9-]*-\\[[^\\]]+\\]!?$',
              message: 'An arbitrary value. Use a token from the design scale, or ask for a new one.',
            },
            {
              pattern: `(?:^|:)(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:${PALETTE})(?:-\\d+)?(?:/\\d+)?$`,
              message: 'A palette colour. Use a design token class (bg-primary, text-muted-foreground).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: TOKEN_FILES,
    rules: { 'no-restricted-syntax': ['error', ...restrictedSyntax, ...rawColour, ...routing] },
  },
  {
    // Zustand stores hold client-only state. Server data lives in TanStack Query and nowhere else,
    // so a store may not import Query, a module's hooks, its server code or its wire types.
    files: ['src/stores/**', 'src/modules/*/stores/**', 'src/**/*-store.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [deepRelative, storeImports],
        },
      ],
    },
  },
  {
    // The logger is the one module that writes to the console.
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // File routes follow TanStack Router's names: __root, index, $param, a trailing _.
    files: ['src/routes/**'],
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        // Param names after `$` are camelCase, as in TanStack's docs (`$noteId`).
        { 'src/routes/**/*.{ts,tsx}': '+([a-zA-Z0-9_.$-])' },
        { ignoreMiddleExtensions: false },
      ],
      'check-file/folder-naming-convention': 'off',
      'check-file/no-index': 'off',
      // Every route renders fully on the server unless it says why not (the stack skill's SSR rule).
      'local/ssr-needs-reason': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': elements,
      'boundaries/files': files,
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          // Also check packages and imports inside one element, so the service rule can see them.
          checkAllOrigins: true,
          checkInternals: true,
          policies: [
            // Packages, and files inside the same element, are allowed. The service rule narrows both.
            { allow: { to: { module: { origin: ['external', 'core'] } } } },
            { allow: { dependency: { relationship: { to: 'internal' } } } },
            { from: { element: { type: 'app' } }, allow: el(['app', 'routes', 'app-server', ...shared]) },
            { from: { element: { type: 'routes' } }, allow: el(['app', 'module', 'app-server', ...shared]) },
            { from: { element: { type: 'app-server' } }, allow: el(['module', ...shared]) },
            // A module uses shared code only. It never imports another module.
            { from: { element: { type: 'module' } }, allow: el(shared) },
            // Only a module's server functions reach the app server (auth and the composition root).
            { from: { file: { categories: 'server-functions' } }, allow: el(['app-server']) },
            // Shared code never imports a module, routes or the app server.
            {
              from: { element: { type: 'components' } },
              allow: el(['components', 'ui-kit', 'hooks', 'lib']),
            },
            { from: { element: { type: 'ui-kit' } }, allow: el(['ui-kit', 'lib']) },
            { from: { element: { type: 'hooks' } }, allow: el(['hooks', 'lib']) },
            { from: { element: { type: 'lib' } }, allow: el(['lib']) },
            { from: { element: { type: 'db' } }, allow: el(['lib']) },
            // Services hold rules: no database, HTTP framework, SDK or adapter.
            {
              from: { file: { categories: 'service' } },
              disallow: [
                { to: { module: { origin: 'external', source: notInServices } } },
                { to: { module: { origin: 'core' } } },
                { to: { element: { type: 'db' } } },
                { to: { file: { categories: ['adapter', 'server-functions'] } } },
              ],
              message: 'A service holds business rules only: no database, HTTP, SDK or adapter imports.',
            },
            // The browser reaches the server only through server functions.
            {
              from: { file: { categories: 'client' } },
              disallow: { to: { file: { categories: 'server-internal' } } },
              message: 'UI and hooks call the server only through <feature>.functions.ts.',
            },
            { disallow: { to: { file: { categories: 'test' } } }, message: 'Never import a test file.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**', 'scripts/**', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // A describe block is a list of cases, not a function to split. Tests also fake foreign throws.
    files: ['**/*.test.{ts,tsx}', 'e2e/**'],
    rules: { 'max-lines-per-function': 'off', '@typescript-eslint/prefer-promise-reject-errors': 'off' },
  },
  {
    // Node runs scripts directly, and the @/ alias is a bundler feature: relative paths there.
    files: ['scripts/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Command-line scripts and build configs talk to the person through the terminal.
    files: ['scripts/**', '*.config.{ts,js}'],
    rules: { 'no-console': 'off' },
  },
  {
    // Plain JavaScript (configs, the local rules, setup-cloudflare.mjs) has no types to check.
    files: ['**/*.{js,cjs,mjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
)
