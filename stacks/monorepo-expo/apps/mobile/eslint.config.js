const js = require('@eslint/js')
const { defineConfig } = require('eslint/config')
const boundaries = require('eslint-plugin-boundaries')
const expo = require('eslint-plugin-expo')
const reactHooks = require('eslint-plugin-react-hooks')
const globals = require('globals')
const tseslint = require('typescript-eslint')

// Not eslint-config-expo: its eslint-plugin-react and eslint-plugin-import don't support ESLint 10
// yet (checked 2026-11). This is the web pack's base plus Expo's own env-variable rules.

// The module boundary check, the same rules as the web pack. Elements are the folders in
// src/; every import between them must match a policy below, or lint fails.
const elements = [
  { type: 'routes', pattern: 'src/app' },
  { type: 'module', pattern: 'src/modules/*', capture: ['module'] },
  { type: 'ui-kit', pattern: 'src/components/ui' },
  { type: 'components', pattern: 'src/components' },
  { type: 'hooks', pattern: 'src/hooks' },
  { type: 'lib', pattern: 'src/lib' },
  { type: 'test-utils', pattern: 'src/test' },
  // Everything else directly in src/: global.css and the generated Uniwind types.
  { type: 'app', pattern: 'src' },
].map((e) => ({ ...e, partialMatch: false }))

const shared = ['components', 'ui-kit', 'hooks', 'lib']
const el = (types) => ({ to: { element: { types } } })

module.exports = defineConfig([
  {
    ignores: [
      'dist',
      '.expo',
      'ios',
      'android',
      'coverage',
      'e2e',
      'src/uniwind-types.d.ts',
      'expo-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, expo },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Expo inlines process.env.EXPO_PUBLIC_* only when read by its full, literal name.
      'expo/no-env-var-destructuring': 'error',
      'expo/no-dynamic-env-var': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': elements,
      'boundaries/files': [{ category: 'test', pattern: 'src/**/*.test.{ts,tsx}' }],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkInternals: true,
          policies: [
            // Packages (react-native, @repo/contracts, ...) and files inside the same element are fine.
            { allow: { to: { module: { origin: ['external', 'core'] } } } },
            { allow: { dependency: { relationship: { to: 'internal' } } } },
            { from: { element: { type: 'app' } }, allow: el(['app', ...shared]) },
            { from: { element: { type: 'routes' } }, allow: el(['app', 'module', ...shared]) },
            // A module uses shared code only. It never imports another module.
            { from: { element: { type: 'module' } }, allow: el(shared) },
            // Shared code never imports a module or a route.
            {
              from: { element: { type: 'components' } },
              allow: el(['components', 'ui-kit', 'hooks', 'lib']),
            },
            { from: { element: { type: 'ui-kit' } }, allow: el(['ui-kit', 'lib']) },
            { from: { element: { type: 'hooks' } }, allow: el(['hooks', 'lib']) },
            { from: { element: { type: 'lib' } }, allow: el(['lib']) },
            // Test helpers wire the shared providers; only test files import them.
            { from: { element: { type: 'test-utils' } }, allow: el(shared) },
            // A test may import what it tests, wherever that lives.
            {
              from: { file: { categories: 'test' } },
              allow: el(['test-utils', 'routes', 'module', 'app', ...shared]),
            },
          ],
        },
      ],
      // The Clerk SDK is wired in one place, so a module never depends on the auth vendor.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@clerk/*'],
              message:
                'Use useSession() from @/hooks/use-session. Only src/components/auth-provider.tsx imports Clerk.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/auth-provider.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['jest.setup.ts', '**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
])
