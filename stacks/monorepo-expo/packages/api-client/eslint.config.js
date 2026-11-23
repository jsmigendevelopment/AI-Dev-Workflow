import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// The API client: fetch and the contracts only. No React, no platform SDK (the caller passes getToken).
export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(react|react-native|react-dom|expo|@expo|@clerk|cloudflare:|drizzle-orm|@tanstack)',
              message: 'The API client stays platform-free: the app passes in getToken and fetch.',
            },
          ],
        },
      ],
    },
  },
  { files: ['*.config.{ts,js}'], languageOptions: { globals: { ...globals.node } } },
)
