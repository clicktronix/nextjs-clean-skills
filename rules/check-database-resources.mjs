#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import { loadArchitecturePaths, relativeParts } from './contract-paths.mjs'

const IGNORED_SOURCE_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.next',
  '.turbo',
  '.vercel',
  '__tests__',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'out',
])
const ROOT_TEST_DIRECTORIES = new Set(['test', 'tests'])

function listSources(directory, sourceRoot = directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (
        IGNORED_SOURCE_DIRECTORIES.has(entry.name) ||
        (directory === sourceRoot && ROOT_TEST_DIRECTORIES.has(entry.name))
      ) {
        return []
      }
      return listSources(absolute, sourceRoot)
    }
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
      ? [absolute]
      : []
  })
}

function subjectFor(file, paths) {
  const moduleParts = relativeParts(paths.moduleRoot, file)
  if (moduleParts?.[0]) return moduleParts[0]
  const sharedParts = relativeParts(paths.sharedRoot, file)
  if (sharedParts?.[0]) return `shared/${sharedParts[0]}`
  if (relativeParts(paths.appRoot, file)) return 'app'
  return null
}

function receiverIdentifiers(node, names = new Set()) {
  if (ts.isIdentifier(node)) names.add(node.text)
  if (ts.isPropertyAccessExpression(node)) {
    receiverIdentifiers(node.expression, names)
    names.add(node.name.text)
  } else if (ts.isCallExpression(node)) {
    receiverIdentifiers(node.expression, names)
  }
  return names
}

// The mutating half of the Supabase builder. A read and a write on the same table are different
// permissions: a consumer legitimately reads a neighbour's table and calls its public RPCs, and
// still must not be the one that decides what that table contains.
const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete'])

/**
 * The methods chained onto this call, in order. `.from('t')` alone says nothing about intent;
 * `.from('t').update({…}).eq(…)` does, and the two differ only by what follows.
 */
function chainedMethods(node) {
  const names = []
  let current = node
  while (
    current.parent &&
    ts.isPropertyAccessExpression(current.parent) &&
    current.parent.expression === current
  ) {
    names.push(current.parent.name.text)
    const call = current.parent.parent
    if (!call || !ts.isCallExpression(call) || call.expression !== current.parent) break
    current = call
  }
  return names
}

function databaseCalls(file, clientIdentifiers) {
  const parsed = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const calls = []

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['from', 'rpc'].includes(node.expression.name.text)
    ) {
      const receiverNames = receiverIdentifiers(node.expression.expression)
      if (![...receiverNames].some((name) => clientIdentifiers.has(name))) {
        ts.forEachChild(node, visit)
        return
      }
      const argument = node.arguments[0]
      const kind = node.expression.name.text === 'from' ? 'table' : 'function'
      calls.push({
        kind,
        name: argument && ts.isStringLiteralLike(argument) ? argument.text : null,
        write: kind === 'table' && chainedMethods(node).some((name) => WRITE_METHODS.has(name)),
        line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
      })
    }
    ts.forEachChild(node, visit)
  }

  visit(parsed)
  return calls
}

const paths = loadArchitecturePaths(import.meta.url, process.argv[2])
const { contract, projectRoot: root, sourceRoot } = paths
const resources = Array.isArray(contract.databaseResources) ? contract.databaseResources : []
const clientIdentifiers = Array.isArray(contract.databaseClientIdentifiers)
  ? new Set(contract.databaseClientIdentifiers)
  : new Set()
const resourceMap = new Map()
const errors = []

if (
  !Array.isArray(contract.databaseClientIdentifiers) ||
  contract.databaseClientIdentifiers.some(
    (identifier) => typeof identifier !== 'string' || !/^[$A-Z_a-z][$\w]*$/.test(identifier)
  )
) {
  errors.push('databaseClientIdentifiers must be an array of JavaScript identifiers')
}

if (resources.length > 0 && clientIdentifiers.size === 0) {
  errors.push('databaseClientIdentifiers must not be empty when databaseResources are declared')
}

if (
  Array.isArray(contract.databaseClientIdentifiers) &&
  clientIdentifiers.size !== contract.databaseClientIdentifiers.length
) {
  errors.push('databaseClientIdentifiers contains duplicate values')
}

if (!Array.isArray(contract.databaseResources)) {
  errors.push('databaseResources must be an array')
}

for (const resource of resources) {
  const key = `${resource.kind}:${resource.name}`
  if (!['table', 'function'].includes(resource.kind) || typeof resource.name !== 'string') {
    errors.push(`invalid database resource ${JSON.stringify(resource)}`)
    continue
  }
  if (typeof resource.owner !== 'string') {
    errors.push(`${key} has no owner`)
    continue
  }
  const consumers = resource.consumers ?? [resource.owner]
  if (
    !Array.isArray(consumers) ||
    consumers.length === 0 ||
    consumers.some((consumer) => typeof consumer !== 'string')
  ) {
    errors.push(`${key} consumers must be a non-empty array of strings`)
    continue
  }
  if (!consumers.includes(resource.owner)) {
    errors.push(`${key} consumers must include owner ${resource.owner}`)
  }
  // `writers` is optional. Absent, `consumers` keeps meaning read-and-RPC-and-write exactly as
  // before, because narrowing it silently would turn every declared consumer of an existing
  // contract into a violation. Present, it names who may decide the table's contents; the owner
  // always may, and a writer must already be a consumer or the read check would contradict it.
  const writers = resource.writers === undefined ? null : resource.writers
  if (writers !== null) {
    if (resource.kind !== 'table') {
      errors.push(`${key} writers is only valid for a table resource`)
      continue
    }
    if (!Array.isArray(writers) || writers.some((writer) => typeof writer !== 'string')) {
      errors.push(`${key} writers must be an array of strings`)
      continue
    }
    const foreign = writers.filter((writer) => !consumers.includes(writer))
    if (foreign.length > 0) {
      errors.push(`${key} writers must be declared consumers: ${foreign.join(', ')}`)
    }
  }
  if (resourceMap.has(key)) errors.push(`${key} is declared more than once`)
  resourceMap.set(key, {
    ...resource,
    consumers: new Set(consumers),
    writers: writers === null ? null : new Set([resource.owner, ...writers]),
  })
}

for (const file of listSources(sourceRoot)) {
  const subject = subjectFor(file, paths)
  const relative = path.relative(root, file).split(path.sep).join('/')
  for (const call of databaseCalls(file, clientIdentifiers)) {
    if (!call.name) {
      errors.push(`${relative}:${call.line} uses a dynamic Supabase ${call.kind} name`)
      continue
    }
    const key = `${call.kind}:${call.name}`
    const resource = resourceMap.get(key)
    if (!resource) {
      errors.push(`${relative}:${call.line} accesses undeclared ${key}`)
      continue
    }
    if (!subject || !resource.consumers.has(subject)) {
      errors.push(
        `${relative}:${call.line} accesses ${key}, owned by ${resource.owner}; allowed consumers: ${[...resource.consumers].join(', ')}`
      )
      continue
    }
    if (call.write && resource.writers !== null && !resource.writers.has(subject)) {
      errors.push(
        `${relative}:${call.line} writes ${key}, owned by ${resource.owner}; allowed writers: ${[...resource.writers].join(', ')}`
      )
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`database resource ownership ok (${resources.length} declared resources)`)
