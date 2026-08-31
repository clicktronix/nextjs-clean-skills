/**
 * Resolver and cycle canaries for capability boundaries.
 *
 * Spread this after eslint-boundaries.mjs. The capability rule understands aliases and relative
 * paths itself; this tier proves imports resolve and rejects dependency cycles that a per-file
 * rule cannot observe.
 */

import importPlugin from 'eslint-plugin-import'

import { loadArchitecturePaths, sourceFilesPattern, SOURCE_EXTENSIONS } from './contract-paths.mjs'

const paths = loadArchitecturePaths(import.meta.url)

const EXTENSIONS = SOURCE_EXTENSIONS.map((extension) => `.${extension}`)

export default [
  {
    files: [sourceFilesPattern(paths)],
    plugins: { import: importPlugin },
    settings: {
      // From the one exported list. Written out by hand these omitted every NodeNext extension, so
      // a same-capability `.mts` cycle written with `.mjs` specifiers resolved to nothing and passed
      // the cycle canary — the resolver and the glob agreed about the project, and this did not.
      'import/extensions': EXTENSIONS,
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
        node: { extensions: EXTENSIONS },
      },
    },
    rules: {
      'import/no-unresolved': ['error', { commonjs: true }],
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'import/no-dynamic-require': ['error', { esmodule: true }],
    },
  },
  {
    files: ['**/__tests__/**/*', `**/*.{test,spec}.{${SOURCE_EXTENSIONS.join(',')}}`],
    rules: {
      'import/no-cycle': 'off',
    },
  },
]
