#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

function findProjectRoot(start) {
  let current = start
  while (true) {
    if (
      fs.existsSync(path.join(current, 'package.json')) &&
      fs.existsSync(path.join(current, 'rules', 'architecture-contract.json'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error('Cannot find package.json and rules/architecture-contract.json')
    }
    current = parent
  }
}

function listSources(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (['__tests__', 'generated'].includes(entry.name)) return []
      return listSources(absolute)
    }
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
      ? [absolute]
      : []
  })
}

function subjectFor(file, root) {
  const parts = path.relative(path.join(root, 'src'), file).split(path.sep)
  if (parts[0] === 'modules' && parts[1]) return parts[1]
  if (parts[0] === 'shared' && parts[1]) return `shared/${parts[1]}`
  if (parts[0] === 'app') return 'app'
  return null
}

function rootIdentifier(node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
    return rootIdentifier(node.expression)
  }
  return null
}

function databaseCalls(file) {
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
      const root = rootIdentifier(node.expression.expression)
      if (node.expression.name.text === 'from' && ['Array', 'Buffer', 'Readable'].includes(root)) {
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

const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : findProjectRoot(path.dirname(fileURLToPath(import.meta.url)))
const contract = JSON.parse(
  fs.readFileSync(path.join(root, 'rules', 'architecture-contract.json'), 'utf8')
)
const resources = Array.isArray(contract.databaseResources) ? contract.databaseResources : []
const resourceMap = new Map()
const errors = []

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

for (const file of listSources(path.join(root, 'src'))) {
  const subject = subjectFor(file, root)
  const relative = path.relative(root, file).split(path.sep).join('/')
  for (const call of databaseCalls(file)) {
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
