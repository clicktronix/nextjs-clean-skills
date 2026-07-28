/**
 * Resolver and cycle canaries for capability boundaries.
 *
 * Spread this after eslint-boundaries.mjs. The capability rule understands aliases and relative
 * paths itself; this tier proves imports resolve and rejects dependency cycles that a per-file
 * rule cannot observe.
 */

import importPlugin from 'eslint-plugin-import'

export default [
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: { import: importPlugin },
    settings: {
      'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
    },
    rules: {
      'import/no-unresolved': ['error', { commonjs: true }],
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'import/no-dynamic-require': ['error', { esmodule: true }],
    },
  },
  {
    files: ['**/__tests__/**/*', '**/*.{test,spec}.{js,jsx,ts,tsx}'],
    rules: {
      'import/no-cycle': 'off',
    },
  },
]
