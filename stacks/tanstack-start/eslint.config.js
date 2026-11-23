import js from '@eslint/js'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

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
  { category: 'server-internal', pattern: 'src/modules/*/server/*.{controller,service,repository,table}.ts' },
  { category: 'server-internal', pattern: 'src/modules/*/server/*.repository.{drizzle,memory}.ts' },
  { category: 'client', pattern: 'src/modules/*/{ui,hooks}/**' },
  { category: 'test', pattern: '**/*.test.ts' },
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

export default tseslint.config(
  {
    ignores: [
      'dist',
      '.wrangler',
      'node_modules',
      'playwright-report',
      'test-results',
      'src/routeTree.gen.ts',
      'worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
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
    files: ['**/*.test.ts', 'e2e/**', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
)
