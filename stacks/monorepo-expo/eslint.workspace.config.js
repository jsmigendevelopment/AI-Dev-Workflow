import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'

// The cross-workspace boundary check, run from the root by `pnpm lint:workspace`.
// It looks only at imports, so it parses every app and package but applies one rule:
//   - an app never imports another app;
//   - a package never imports an app;
//   - nobody reaches into another workspace's files with a relative path (`../../web/src/...`).
//     A package is used through its name and its `exports`, never its folders.
// Each workspace's own eslint.config.js checks the rules inside it (modules, layers).
// `-c` on the command line makes ESLint use this file only, not the workspaces' configs.

const elements = [
  { type: 'app', pattern: 'apps/*', capture: ['name'] },
  { type: 'package', pattern: 'packages/*', capture: ['name'] },
]

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/.wrangler/**',
      '**/.tanstack/**',
      '**/coverage/**',
      '**/routeTree.gen.ts',
      '**/worker-configuration.d.ts',
    ],
  },
  // The onRails kit's rules, skills and hooks sit at the root but aren't app code (#146).
  { ignores: ['.agents', '.claude', '.codex'] },
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
      },
      'boundaries/elements': elements,
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'app' } },
              disallow: { to: { element: { type: 'app', captured: { name: '!{{ from.captured.name }}' } } } },
              message: 'Apps never import each other. Move the shared code into packages/.',
            },
            {
              from: { element: { type: 'package' } },
              disallow: { to: { element: { type: 'app' } } },
              message: 'A package never imports an app.',
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+(apps|packages)/',
              message: 'Do not reach into another workspace by path. Import the package by name.',
            },
            {
              regex: '^@repo/[^/]+/(src|dist)(/|$)',
              message: 'Import a package by its name and exports, never its src or dist files.',
            },
          ],
        },
      ],
    },
  },
]
