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

import {
  loadArchitecturePaths,
  relativeParts,
  resolveToExistingFile,
  moduleSpecifiers,
  developmentArtifactPredicate,
  SOURCE_EXTENSIONS,
} from './contract-paths.mjs'

const paths = loadArchitecturePaths(import.meta.url, process.argv[2])
const { contract, projectRoot, sourceRoot, moduleRoot, appRoot } = paths

const neutralSurfaces = new Set(contract.neutralSurfaces ?? [])
const serverSurfaces = new Set(contract.serverSurfaces ?? [])
const SOURCE = /\.[cm]?[jt]sx?$/
// Their own channels. A route handler or an action module that reads a neutral surface is using it
// as a server module, not prefetching into a hydrated client cache, so it is not the second side.
// Under the app root, `route` is the only FILENAME convention that names a channel. `actions` is not
// a Next.js convention at all — an action module is one because of its directive — so matching the
// name cut a legitimate `page.tsx -> actions.helper.ts` composition path. The `actions` SURFACE of a
// capability is still recognised, by its position in the module vocabulary, in `isOwnChannel`.
const OWN_CHANNELS = new Set(['route'])
// Next.js composition entrypoints — every current UI file convention, not a remembered subset:
// `forbidden`, `unauthorized` and `global-not-found` were missing, so a page that legitimately
// prefetched from one of them reported no server side at all. Overridable, because the framework
// adds conventions and `pageExtensions` lets a project spell them `page.page.tsx`.
const APP_ENTRYPOINTS = new Set(
  contract.appEntrypoints ?? [
    'page', 'layout', 'template', 'default', 'loading', 'error', 'global-error',
    'not-found', 'global-not-found', 'forbidden', 'unauthorized',
  ]
)

function listSourceFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(absolute)
    return SOURCE.test(entry.name) ? [absolute] : []
  })
}

const stem = (file) => path.basename(file).replace(SOURCE, '')
// The CONVENTION a file name states. Next matches a file convention against its CONFIGURED
// extensions — `pageExtensions: ['page.tsx']` makes the route file `page.page.tsx` — so the name is
// the basename minus one configured extension, exactly. Reading the first dot-segment instead made
// every `page.helper.ts` a composition entrypoint and every `route.helper.ts` a channel of its own:
// one invented a server side, the other cut a real one.
const PAGE_EXTENSIONS = contract.pageExtensions ?? SOURCE_EXTENSIONS
const convention = (file) => {
  const base = path.basename(file)
  for (const extension of PAGE_EXTENSIONS) {
    if (base.endsWith(`.${extension}`)) return base.slice(0, -(extension.length + 1))
  }
  return null
}

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
const isDevArtifact = developmentArtifactPredicate(paths)
function isNonRuntimeFile(file) {
  const base = path.basename(file)
  // Declarations are types with a file extension: erased before any build, so they belong to no
  // runtime. Everything else is the shared development-artifact predicate.
  return base.endsWith('.d.ts') || /\.d\.[cm]ts$/.test(base) || isDevArtifact(file)
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

// One extractor, shared with check-shared-admission.mjs and check-module-cycles.mjs. Three private
// copies disagreed about which forms are edges — a no-substitution template, `module.require`, a
// type-only import-equals — and every disagreement showed up as a missing consumer somewhere.
const valueEdges = (parsed) => moduleSpecifiers(parsed, { valueOnly: true })

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

// Traversal without barriers is not the effective graph, it is the import graph — and the whole
// point of the runtimes is that they do not flow into each other. Unbounded, a page reaching a
// Client Component put that component on the server, and a Client Component importing `actions.ts`
// put the action module and everything below it in the browser. Neither happens in a build.
function reachableFrom(roots, blocked) {
  const seen = new Set(roots.filter((file) => !blocked(file)))
  const queue = [...seen]
  while (queue.length > 0) {
    for (const target of edges.get(queue.pop()) ?? []) {
      if (seen.has(target) || blocked(target)) continue
      seen.add(target)
      queue.push(target)
    }
  }
  return seen
}

const isClientBoundary = (file) => hasDirective(parsed.get(file), 'use client')
// A channel of its own: a Server Action or a route handler. It is not an RSC prefetch/hydration path
// in either direction — the browser holds a reference to a Server Action rather than its
// implementation, and a page that calls an action is not prefetching through it. Both graphs stop
// here; the server one did not, so `page.tsx -> actions.ts -> query-cache.ts` manufactured the
// prefetch side out of a channel that never prefetches.
const isOwnChannel = (file) => {
  if (hasDirective(parsed.get(file), 'use server')) return true
  if (moduleLocation(file)?.surface === 'actions') return true
  return Boolean(relativeParts(appRoot, file)) && OWN_CHANNELS.has(convention(file))
}
// Where the client graph stops: an own channel, or any server-owned module.
const isServerOnly = (file) => {
  if (isOwnChannel(file)) return true
  const module = moduleLocation(file)
  return Boolean(module && (module.segment === 'server' || serverSurfaces.has(module.surface)))
}

// The two graphs are INDEPENDENT, and a file can be in both. Answering with a single side and
// letting client win meant a view rendered by a page and also imported by a Client Component
// counted as browser-only, so a correctly wired surface was reported as having no server side.
const clientReachable = reachableFrom(files.filter(isClientBoundary), isServerOnly)

// Where prefetch and hydration happen: the capability's RSC surface, its private server segment
// (§ Dependency Direction 9 admits that import for the neutral surface specifically), and route
// composition under the app root. A route handler or an action module is its OWN channel — using
// the surface as a server module, not prefetching into a hydrated cache — and an action module is
// recognised by its `'use server'` prologue, not only by the basename `actions`, since the
// directive is what makes it one.
const serverRoots = files.filter((file) => {
  const module = moduleLocation(file)
  // `server/**` is where prefetch LIVES, not where the server graph starts. Seeded as a root, an
  // action-only helper under `server/**` — or a private file nothing imports at all — manufactured
  // the prefetch side on its own, which is the claim the own-channel barrier exists to prevent. It
  // must be REACHED from an RSC surface or an App composition entrypoint.
  if (module?.surface === 'rsc') return true
  // Under the app root, only a real COMPOSITION entrypoint seeds the graph. "Every app file that is
  // not a route handler or an action" made a route's own private helper a server root of its own,
  // and a `'use client'` page a server root as well — each inventing a server side out of a file
  // that composes nothing.
  if (!relativeParts(appRoot, file)) return false
  return APP_ENTRYPOINTS.has(convention(file))
})
const serverReachable = reachableFrom(serverRoots, (file) => isClientBoundary(file) || isOwnChannel(file))

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
