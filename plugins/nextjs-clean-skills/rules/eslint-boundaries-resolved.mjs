/**
 * Resolver, cycle and runtime-marker canaries for capability boundaries.
 *
 * Spread this after eslint-boundaries.mjs. The capability rule understands aliases and relative
 * paths itself; this tier proves imports resolve, rejects dependency cycles that a per-file rule
 * cannot observe, and checks the one guarantee the path rules lean on but never enforced: the
 * `server-only` / `client-only` markers that make the bundler, not a reviewer, refuse a module
 * pulled into the wrong runtime.
 */

import path from 'node:path'

import importPlugin from 'eslint-plugin-import'

import {
  loadArchitecturePaths,
  posix,
  relativeParts,
  sourceFilesPattern,
  SOURCE_EXTENSIONS,
} from './contract-paths.mjs'

const paths = loadArchitecturePaths(import.meta.url)
const { contract } = paths

const EXTENSIONS = SOURCE_EXTENSIONS.map((extension) => `.${extension}`)
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/

// Every surface whose module must be unloadable from the other runtime. Derived from the contract's
// own surface classes: a server execution surface that runs a request (`server`, `rsc`, `stream`,
// `job`) is poisoned for the browser, and the browser surface is poisoned for the server.
// `actions.ts` is excluded deliberately — it is the one surface browser code is meant to import.
const RUNTIME_MARKERS = new Map([
  ...(contract.serverSurfaces ?? []).map((surface) => [surface, 'server-only']),
  ...(contract.clientSurfaces ?? [])
    .filter((surface) => surface === 'client')
    .map((surface) => [surface, 'client-only']),
])

function rootSurface(filename) {
  const parts = relativeParts(paths.moduleRoot, filename)
  if (!parts || parts.length !== 2 || !SOURCE_EXT.test(parts[1])) return null
  return path.basename(parts[1]).replace(SOURCE_EXT, '')
}

function isTestFile(filename) {
  return /(?:^|\/)__tests__(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(posix(filename))
}

/**
 * The path rules say a browser module must not import a server surface. They cannot say anything
 * about a module the bundler pulls in some other way — a barrel, a transitive dependency, a route
 * the author wired by hand. `server-only` and `client-only` move that from a review promise to a
 * build failure, and the contract has claimed them as part of the floor since 4.0 without checking
 * that they are there.
 */
const runtimeMarkerRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require the server-only/client-only marker on runtime-bound surfaces.' },
    schema: [],
    messages: {
      missingRuntimeMarker:
        "{{surface}} must import '{{marker}}' before its other imports so the bundler, not a reviewer, refuses the wrong runtime.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename()
    if (!filename || filename === '<input>' || isTestFile(filename)) return {}
    const surface = rootSurface(filename)
    const marker = surface === null ? undefined : RUNTIME_MARKERS.get(surface)
    if (!marker) return {}

    return {
      Program(node) {
        // The first import, not merely a present one: module bodies run in order, and a marker
        // placed after the imports it is supposed to guard poisons the module too late to matter.
        // Type-only imports are erased before the module body runs, so they cannot precede the
        // marker in any order that matters; the first VALUE import is what must come after it.
        const firstImport = node.body.find(
          (statement) => statement.type === 'ImportDeclaration' && statement.importKind !== 'type'
        )
        if (
          firstImport &&
          firstImport.specifiers.length === 0 &&
          firstImport.source.value === marker
        ) {
          return
        }
        context.report({
          node,
          messageId: 'missingRuntimeMarker',
          data: { surface: path.basename(filename), marker },
        })
      },
    }
  },
}

const markerPlugin = {
  meta: { name: 'nextjs-clean-runtime-markers', version: contract.contractVersion },
  rules: { 'runtime-markers': runtimeMarkerRule },
}

export default [
  {
    files: [sourceFilesPattern(paths)],
    // A namespace of its own: flat config refuses to bind one namespace to two plugin objects, and
    // `clean-architecture` already belongs to eslint-boundaries.mjs for the same files.
    plugins: { import: importPlugin, 'clean-runtime': markerPlugin },
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
      'clean-runtime/runtime-markers': 'error',
    },
  },
  {
    files: ['**/__tests__/**/*', `**/*.{test,spec}.{${SOURCE_EXTENSIONS.join(',')}}`],
    rules: {
      'import/no-cycle': 'off',
      'clean-runtime/runtime-markers': 'off',
    },
  },
]
