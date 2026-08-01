import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'src-tauri',
      'graphify-out',
      'scripts',
      'tests',
      '*.config.js',
      '*.config.ts',
      'vite.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // Hooks — a regra dura fica em error (bug real), deps fica em warn.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Ordem de import/export determinística (autofix).
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
      // Rigor de tipos — warn por enquanto (os `any` estão na migração do store).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Todo IPC do backend passa pelo wrapper lib/tauri.ts (convenção do projeto).
      // warn por enquanto; vira error depois de migrar os call-sites (Fase 1D).
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@tauri-apps/api/core',
              importNames: ['invoke'],
              message: 'Use as funções de lib/tauri.ts em vez de invoke() cru.',
            },
          ],
        },
      ],
    },
  },
  {
    // O wrapper é o único autorizado a chamar invoke() diretamente.
    files: ['src/lib/tauri.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Testes: relaxa regras que atrapalham setup/mocks.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  prettier,
)
