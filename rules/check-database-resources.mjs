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
      calls.push({
        kind: node.expression.name.text === 'from' ? 'table' : 'function',
        name: argument && ts.isStringLiteralLike(argument) ? argument.text : null,
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
  if (resourceMap.has(key)) errors.push(`${key} is declared more than once`)
  resourceMap.set(key, {
    ...resource,
    consumers: new Set(consumers),
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
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`database resource ownership ok (${resources.length} declared resources)`)
