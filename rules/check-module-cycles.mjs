#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

function findProjectRoot(start) {
  let current = start
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current
    const parent = path.dirname(current)
    if (parent === current) throw new Error('Cannot find package.json above check-module-cycles.mjs')
    current = parent
  }
}

const root = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)))
const contract = JSON.parse(
  fs.readFileSync(new URL('./architecture-contract.json', import.meta.url), 'utf8')
)
const modulesRoot = path.join(root, contract.moduleRoot)

function listSources(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return []
      return listSources(absolute)
    }
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
      ? [absolute]
      : []
  })
}

function capabilityOf(absolute) {
  const relative = path.relative(modulesRoot, absolute)
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) return null
  return relative.split(path.sep)[0] || null
}

function importsFrom(file) {
  const source = fs.readFileSync(file, 'utf8')
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const specifiers = []

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
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
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
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

function resolveProjectImport(importer, specifier) {
  if (specifier.startsWith('@/')) return path.join(root, 'src', specifier.slice(2))
  if (specifier.startsWith('.')) return path.resolve(path.dirname(importer), specifier)
  return null
}

const graph = new Map()
const sources = listSources(modulesRoot)
for (const file of sources) {
  const source = capabilityOf(file)
  if (!source) continue
  graph.set(source, graph.get(source) ?? new Set())
  for (const specifier of importsFrom(file)) {
    const targetPath = resolveProjectImport(file, specifier)
    const target = targetPath ? capabilityOf(targetPath) : null
    if (target && target !== source) graph.get(source).add(target)
  }
}

const state = new Map()
const stack = []
const cycles = new Map()

function canonicalCycle(nodes) {
  const body = nodes.slice(0, -1)
  const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)])
  rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')))
  return [...rotations[0], rotations[0][0]]
}

function visit(node) {
  state.set(node, 'active')
  stack.push(node)

  for (const target of graph.get(node) ?? []) {
    if (state.get(target) === 'active') {
      const start = stack.indexOf(target)
      const cycle = canonicalCycle([...stack.slice(start), target])
      cycles.set(cycle.join(' -> '), cycle)
    } else if (!state.has(target)) {
      visit(target)
    }
  }

  stack.pop()
  state.set(node, 'done')
}

for (const node of graph.keys()) {
  if (!state.has(node)) visit(node)
}

if (cycles.size > 0) {
  for (const cycle of cycles.values()) {
    console.error(`capability cycle: ${cycle.join(' -> ')}`)
  }
  process.exitCode = 1
} else {
  const edges = [...graph.values()].reduce((total, targets) => total + targets.size, 0)
  console.log(`module graph ok (${graph.size} capabilities, ${edges} cross-capability edges)`)
}
