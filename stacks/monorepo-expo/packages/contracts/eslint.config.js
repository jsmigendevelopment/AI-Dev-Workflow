import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// A contract package holds schemas and types only: no platform, no network, no React.
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
              message: 'Contracts stay platform-free: schemas and types only.',
            },
          ],
        },
      ],
    },
  },
  { files: ['*.config.{ts,js}'], languageOptions: { globals: { ...globals.node } } },
)
