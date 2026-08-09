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
 * Consumers are classified by runtime, never by folder alone:
 *   client  a `'use client'` directive, a client-side segment, or a client surface
 *   server  the capability's `rsc` surface, or route composition under appRoot that is not itself
 *           a route handler or an action module (those are their own channels, not prefetch sites)
 *
 * A surface with no consumer at all fails the same way: the check reports what it found rather than
 * assuming absence means "not wired up yet".
 */
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

import { loadArchitecturePaths, relativeParts, resolveToExistingFile } from './contract-paths.mjs'

const paths = loadArchitecturePaths(import.meta.url, process.argv[2])
const { contract, projectRoot, sourceRoot, moduleRoot, appRoot } = paths

const neutralSurfaces = new Set(contract.neutralSurfaces ?? [])
const clientSurfaces = new Set(contract.clientSurfaces ?? [])
// Segment names and surface names coincide for the browser-owned ones (`client`, `ui`), which is
// what makes this derivable instead of a second hardcoded list.
const clientSegments = new Set((contract.segments ?? []).filter((segment) => clientSurfaces.has(segment)))
const SOURCE = /\.[cm]?[jt]sx?$/
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

const parse = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

function hasUseClientDirective(parsed) {
  return parsed.statements.some(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === 'use client'
  )
}

function consumerSide(file, parsed) {
  const module = moduleLocation(file)
  if (
    hasUseClientDirective(parsed) ||
    clientSegments.has(module?.segment) ||
    clientSurfaces.has(module?.surface)
  ) {
    return 'client'
  }
  if (module?.surface === 'rsc') return 'server'

  const inApp = relativeParts(appRoot, file)
  if (inApp && !OWN_CHANNELS.has(stem(file))) return 'server'
  return null
}

function importSpecifiers(parsed) {
  const specifiers = []
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text)
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

const files = listSourceFiles(sourceRoot)
const usage = new Map()
for (const file of files) {
  const location = moduleLocation(file)
  if (location?.surface && neutralSurfaces.has(location.surface)) usage.set(file, new Set())
}

for (const file of files) {
  const parsed = parse(file, fs.readFileSync(file, 'utf8'))
  const side = consumerSide(file, parsed)
  if (!side) continue
  for (const specifier of importSpecifiers(parsed)) {
    const target = resolveToExistingFile(paths, file, specifier)
    if (target && usage.has(target)) usage.get(target).add(side)
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
