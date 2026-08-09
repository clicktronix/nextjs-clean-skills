#!/usr/bin/env node
/**
 * A runtime-neutral public surface exists to give ONE serializable identity to something both
 * runtimes use. The skill states the condition:
 *
 *   "Create `query-cache.ts` only when server prefetch/hydration and a browser query share the same
 *    serializable key identity."
 *
 * `eslint-boundaries.mjs` already constrains what such a surface may IMPORT (messageId
 * `neutralDirection`). Nothing checked the other half — that it is actually consumed from both
 * sides. A neutral surface used by only one runtime is not neutral; it is that runtime's file
 * sitting in a public slot, and every later reader has to re-derive why it is there.
 *
 * WHICH RUNTIME A CONSUMER IS ON IS A GRAPH QUESTION, NOT A FOLDER QUESTION. The first version of
 * this check answered it from folder names and a directive scan, and every one of its shortcuts was
 * wrong in a way that produced a verdict rather than an error:
 *
 *   - `ui/**` was read as client, but the contract permits server-renderable views there, so an RSC
 *     consumer plus a server-rendered view passed as "both runtimes" when both were the server;
 *   - a private `server/prefetch.ts` — the canonical server side of a hydrated cache — was neither
 *     client nor server, so a correctly wired surface failed;
 *   - test-only and type-only imports counted as runtime consumers, and a type import is erased
 *     before a module graph exists;
 *   - `export { key } from './query-cache'` was not an edge at all, so a re-exporting consumer was
 *     invisible;
 *   - a `'use client'` string anywhere in the file counted, including prose about the directive;
 *   - a helper with no directive of its own was never client, even when only Client Components
 *     import it — which is exactly how Next.js puts it in the client bundle.
 *
 * So the client side is computed the way the framework computes it: a file is a Client Component if
 * it declares the boundary in its directive prologue, or if something already in the client graph
 * imports it. Everything else is evaluated for the server side by where it sits.
 */
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

import { loadArchitecturePaths, relativeParts, resolveToExistingFile } from './contract-paths.mjs'

const paths = loadArchitecturePaths(import.meta.url, process.argv[2])
const { contract, projectRoot, sourceRoot, moduleRoot, appRoot } = paths

const neutralSurfaces = new Set(contract.neutralSurfaces ?? [])
const SOURCE = /\.[cm]?[jt]sx?$/
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
const STORY_FILE = /\.stories\.([cm]?[jt]sx?|mdx)$/
const TEST_DIR = new Set(['__tests__', '__mocks__'])
// Their own channels. A route handler or an action module that reads a neutral surface is using it
// as a server module, not prefetching into a hydrated client cache, so it is not the second side.
const OWN_CHANNELS = new Set(['route', 'actions'])

function listSourceFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(absolute)
    return SOURCE.test(entry.name) ? [absolute] : []
  })
}

const stem = (file) => path.basename(file).replace(SOURCE, '')

function moduleLocation(file) {
  const parts = relativeParts(moduleRoot, file)
  if (!parts || parts.length < 2) return null
  const tail = parts.slice(1)
  return {
    capability: parts[0],
    segment: tail.length > 1 ? tail[0] : null,
    surface: tail.length === 1 ? stem(tail[0]) : null,
  }
}

// Nothing here ships on a runtime, and each was enough to invent a side on its own: one client test
// made a server-only surface look cross-runtime, a client story did the same, and a declaration file
// under the app root manufactured a server consumer out of types that are erased before the build.
function isNonRuntimeFile(file) {
  const base = path.basename(file)
  if (TEST_FILE.test(base) || STORY_FILE.test(base) || base.endsWith('.d.ts') || /\.d\.[cm]ts$/.test(base)) return true
  return path.relative(projectRoot, file).split(path.sep).some((part) => TEST_DIR.has(part))
}

const parse = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

// Next.js reads `'use client'` from the DIRECTIVE PROLOGUE only: the run of leading string-literal
// expression statements, ending at the first statement that is anything else. Scanning every
// statement instead accepted a bare string further down the file, which the framework does not.
function hasDirective(parsed, directive) {
  for (const statement of parsed.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false
    if (statement.expression.text === directive) return true
  }
  return false
}

// Value edges only, and every form of them. A type-only import is erased before the module graph
// exists, so it puts nothing on either runtime; a re-export is as real an edge as an import; and a
// `require()` or `import x = require()` is an edge in the `.cjs`/`.cts` files this check already
// scans — omitting them made a real browser consumer invisible and its surface server-only.
function valueEdges(parsed) {
  const specifiers = []
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text)
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      // No clause at all is `import './side-effect'`, which is a value edge by definition.
      const typeOnly =
        clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)))
      if (!typeOnly) specifiers.push(node.moduleSpecifier.text)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly =
        node.isTypeOnly ||
        (node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.every((element) => element.isTypeOnly))
      if (!typeOnly) specifiers.push(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return specifiers
}

const files = listSourceFiles(sourceRoot).filter((file) => !isNonRuntimeFile(file))
const parsed = new Map(files.map((file) => [file, parse(file, fs.readFileSync(file, 'utf8'))]))
const edges = new Map(
  files.map((file) => [
    file,
    valueEdges(parsed.get(file))
      .map((specifier) => resolveToExistingFile(paths, file, specifier))
      .filter((target) => target && parsed.has(target)),
  ])
)

function reachableFrom(roots) {
  const seen = new Set(roots)
  const queue = [...seen]
  while (queue.length > 0) {
    for (const target of edges.get(queue.pop()) ?? []) {
      if (seen.has(target)) continue
      seen.add(target)
      queue.push(target)
    }
  }
  return seen
}

// The two graphs are INDEPENDENT, and a file can be in both. Answering with a single side and
// letting client win meant a view rendered by a page and also imported by a Client Component
// counted as browser-only, so a correctly wired surface was reported as having no server side.
const clientReachable = reachableFrom(files.filter((file) => hasDirective(parsed.get(file), 'use client')))

// Where prefetch and hydration happen: the capability's RSC surface, its private server segment
// (§ Dependency Direction 9 admits that import for the neutral surface specifically), and route
// composition under the app root. A route handler or an action module is its OWN channel — using
// the surface as a server module, not prefetching into a hydrated cache — and an action module is
// recognised by its `'use server'` prologue, not only by the basename `actions`, since the
// directive is what makes it one.
const serverRoots = files.filter((file) => {
  const module = moduleLocation(file)
  if (module?.surface === 'rsc' || module?.segment === 'server') return true
  if (!relativeParts(appRoot, file)) return false
  return !OWN_CHANNELS.has(stem(file)) && !hasDirective(parsed.get(file), 'use server')
})
const serverReachable = reachableFrom(serverRoots)

const usage = new Map()
for (const file of files) {
  const location = moduleLocation(file)
  if (location?.surface && neutralSurfaces.has(location.surface)) usage.set(file, new Set())
}

for (const file of files) {
  const sides = []
  if (clientReachable.has(file)) sides.push('client')
  if (serverReachable.has(file)) sides.push('server')
  if (sides.length === 0) continue
  for (const target of edges.get(file) ?? []) {
    if (!usage.has(target)) continue
    for (const side of sides) usage.get(target).add(side)
  }
}

const errors = []
for (const [file, consumers] of usage) {
  if (consumers.has('server') && consumers.has('client')) continue
  errors.push(
    `${path.relative(projectRoot, file)} requires both server prefetch/hydration and client query consumers; found ${
      [...consumers].sort().join(', ') || 'none'
    }`
  )
}

if (errors.length > 0) {
  for (const error of errors) console.error(error)
  console.error(
    '\nA runtime-neutral surface with one side is that side\'s module in a public slot. Either give it its ' +
      'second consumer, or move it into the runtime that actually uses it and delete the surface.'
  )
  process.exitCode = 1
} else {
  console.log(`neutral surfaces ok (${usage.size} cross-runtime query caches)`)
}
