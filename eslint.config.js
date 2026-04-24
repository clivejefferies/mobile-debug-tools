import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import unusedImports from 'eslint-plugin-unused-imports'

export default [
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.git/',
      '.vscode/',
      'coverage/',
      '.env'
    ]
  },
  {
    files: ['src/**/*.ts', 'src/**/*.js', 'test/**/*.ts', 'test/**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'unused-imports': unusedImports
    },
    rules: {
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['error', { vars: 'all', args: 'after-used', ignoreRestSiblings: true }],
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
]
