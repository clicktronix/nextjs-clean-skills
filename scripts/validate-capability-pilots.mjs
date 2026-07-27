#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import { fail, root } from './_lib.mjs'

const fixturesRoot = path.join(root, 'tests/architecture-pilots/fixtures')
const publicSurfaceNames = new Set([
  'actions.ts',
  'client.ts',
  'job.ts',
  'rsc.ts',
  'server.ts',
  'stream.ts',
  'ui.ts',
])
const runtimePackagePattern = /^(?:next(?:\/|$)|react(?:\/|$)|server-only$|client-only$|@sentry\/|@supabase\/)/

function listTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return listTypeScriptFiles(absolute)
    return entry.name.endsWith('.ts') ? [absolute] : []
  })
}

function loadFixture(fixtureId) {
  const fixtureRoot = path.join(fixturesRoot, fixtureId)
  return {
    fixtureId,
    fixtureRoot,
    sources: new Map(
      listTypeScriptFiles(fixtureRoot).map((file) => [file, fs.readFileSync(file, 'utf8')])
    ),
  }
}

function moduleLocation(file, fixtureRoot) {
  const parts = path.relative(fixtureRoot, file).split(path.sep)
  if (parts[0] !== 'src' || parts[1] !== 'modules' || parts.length < 4) return null
  return {
    moduleName: parts[2],
    tail: parts.slice(3),
  }
}

function isShared(file, fixtureRoot) {
  const parts = path.relative(fixtureRoot, file).split(path.sep)
  return parts[0] === 'src' && parts[1] === 'shared'
}

function importSpecifiers(file, source) {
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
    ts.forEachChild(node, visit)
  }

  visit(parsed)
  return specifiers
}

function resolveRelativeImport(importer, specifier, sources) {
  if (!specifier.startsWith('.')) return null
  const unresolved = path.resolve(path.dirname(importer), specifier)
  const candidates = [
    unresolved,
    unresolved.endsWith('.js') ? `${unresolved.slice(0, -3)}.ts` : `${unresolved}.ts`,
    path.join(unresolved, 'index.ts'),
  ]
  return candidates.find((candidate) => sources.has(candidate)) ?? false
}

function exportedDeclarationCount(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  return parsed.statements.filter((statement) => {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) return false
    return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  }).length
}

function findCycles(graph) {
  const cycles = []
  const visited = new Set()
  const active = []

  function visit(node) {
    const activeIndex = active.indexOf(node)
    if (activeIndex !== -1) {
      cycles.push([...active.slice(activeIndex), node])
      return
    }
    if (visited.has(node)) return

    active.push(node)
    for (const target of graph.get(node) ?? []) visit(target)
    active.pop()
    visited.add(node)
  }

  for (const node of graph.keys()) visit(node)
  return cycles
}

function analyzeFixture({ fixtureId, fixtureRoot, sources }) {
  const errors = []
  const moduleGraph = new Map()

  const addError = (code, file, message) => {
    errors.push({
      code,
      file: path.relative(root, file).split(path.sep).join('/'),
      message,
    })
  }

  for (const [file, source] of sources) {
    const owner = moduleLocation(file, fixtureRoot)

    if (owner && owner.tail.length === 1) {
      const [surface] = owner.tail
      if (!publicSurfaceNames.has(surface)) {
        addError('UNKNOWN_PUBLIC_SURFACE', file, `${surface} is not an admitted root surface`)
      } else if (exportedDeclarationCount(file, source) === 0) {
        addError(
          'PUBLIC_BARREL_ONLY',
          file,
          `${surface} must declare a narrowing contract instead of only re-exporting internals`
        )
      }
    }

    for (const specifier of importSpecifiers(file, source)) {
      const sourceSegment = owner?.tail.length > 1 ? owner.tail[0] : null
      if (
        !specifier.startsWith('.') &&
        ['domain', 'application'].includes(sourceSegment) &&
        runtimePackagePattern.test(specifier)
      ) {
        addError(
          sourceSegment === 'domain' ? 'DOMAIN_DIRECTION' : 'APPLICATION_RUNTIME_IMPORT',
          file,
          `${sourceSegment} imports runtime package ${specifier}`
        )
      }

      const target = resolveRelativeImport(file, specifier, sources)
      if (target === false) {
        addError('UNRESOLVED_IMPORT', file, `cannot resolve ${specifier}`)
        continue
      }
      if (target === null) continue

      const targetOwner = moduleLocation(target, fixtureRoot)
      if (isShared(file, fixtureRoot) && targetOwner) {
        addError('SHARED_IMPORTS_MODULE', file, `shared code imports ${targetOwner.moduleName}`)
      }

      if (
        targetOwner &&
        (!owner || owner.moduleName !== targetOwner.moduleName) &&
        (targetOwner.tail.length !== 1 || !publicSurfaceNames.has(targetOwner.tail[0]))
      ) {
        addError(
          'MODULE_INTERNAL_IMPORT',
          file,
          `${owner?.moduleName ?? 'external consumer'} imports internal path of ${targetOwner.moduleName}`
        )
      }

      if (!owner || !targetOwner) continue

      const targetSegment = targetOwner.tail.length > 1 ? targetOwner.tail[0] : null
      const targetRoot = targetOwner.tail.length === 1 ? targetOwner.tail[0] : null

      if (owner.moduleName !== targetOwner.moduleName) {
        moduleGraph.set(owner.moduleName, moduleGraph.get(owner.moduleName) ?? new Set())
        moduleGraph.get(owner.moduleName).add(targetOwner.moduleName)
      }

      if (
        sourceSegment === 'domain' &&
        (owner.moduleName !== targetOwner.moduleName || targetSegment !== 'domain')
      ) {
        addError('DOMAIN_DIRECTION', file, `domain imports ${specifier}`)
      }

      if (sourceSegment === 'application') {
        if (owner.tail[1] === 'ports' && ['server', 'client', 'ui'].includes(targetSegment)) {
          addError('PORT_DIRECTION', file, `application port imports ${targetSegment}`)
        } else if (
          ['server', 'client', 'ui'].includes(targetSegment) ||
          ['server.ts', 'rsc.ts', 'actions.ts', 'stream.ts', 'job.ts', 'client.ts', 'ui.ts'].includes(
            targetRoot
          )
        ) {
          addError('APPLICATION_RUNTIME_IMPORT', file, `application imports ${specifier}`)
        }
      }

      const sourceIsClient =
        ['client', 'ui'].includes(sourceSegment) ||
        ['client.ts', 'ui.ts'].includes(owner.tail[0])
      const targetIsServer =
        targetSegment === 'server' ||
        ['server.ts', 'rsc.ts', 'stream.ts', 'job.ts'].includes(targetRoot)
      const sourceIsServer =
        sourceSegment === 'server' ||
        ['server.ts', 'rsc.ts', 'actions.ts', 'stream.ts', 'job.ts'].includes(owner.tail[0])
      const targetIsClient =
        ['client', 'ui'].includes(targetSegment) ||
        ['client.ts', 'ui.ts'].includes(targetRoot)
      if (sourceIsClient && targetIsServer) {
        addError('CLIENT_SERVER_IMPORT', file, `browser-safe code imports ${specifier}`)
      }
      if (sourceIsServer && targetIsClient) {
        addError('SERVER_CLIENT_IMPORT', file, `server code imports ${specifier}`)
      }
    }
  }

  for (const cycle of findCycles(moduleGraph)) {
    errors.push({
      code: 'MODULE_CYCLE',
      file: fixtureId,
      message: cycle.join(' -> '),
    })
  }

  return errors
}

function mutate(fixture, relativeFile, transform) {
  const file = path.join(fixturesRoot, fixture.fixtureId, relativeFile)
  const source = fixture.sources.get(file)
  if (source === undefined) throw new Error(`mutation target not found: ${file}`)
  return {
    ...fixture,
    sources: new Map(fixture.sources).set(file, transform(source)),
  }
}

function requireMutation(label, fixture, expectedCode) {
  const errors = analyzeFixture(fixture)
  if (!errors.some((error) => error.code === expectedCode)) {
    return `${label}: expected ${expectedCode}, received ${errors.map((error) => error.code).join(', ')}`
  }
  return null
}

const fixtures = {
  assistant: loadFixture('assistant-stream'),
  board: loadFixture('board-workflow'),
  workItems: loadFixture('work-items'),
}
const errors = Object.values(fixtures).flatMap(analyzeFixture)

const mutations = [
  requireMutation(
    'cross-module internals',
    mutate(
      fixtures.board,
      'src/modules/board/server/adapters.ts',
      (source) =>
        source.replace(
          "'../../work-items/server.js'",
          "'../../work-items/server/store.js'"
        )
    ),
    'MODULE_INTERNAL_IMPORT'
  ),
  requireMutation(
    'app imports module internals',
    mutate(
      fixtures.board,
      'src/app/board/page.ts',
      (source) => `${source}\nimport '../../modules/work-items/server/store.js'\n`
    ),
    'MODULE_INTERNAL_IMPORT'
  ),
  requireMutation(
    'application runtime import',
    mutate(
      fixtures.assistant,
      'src/modules/assistant/application/generate-response.ts',
      (source) => `${source}\nimport '../server/provider.js'\n`
    ),
    'APPLICATION_RUNTIME_IMPORT'
  ),
  requireMutation(
    'application framework package',
    mutate(
      fixtures.assistant,
      'src/modules/assistant/application/generate-response.ts',
      (source) => `${source}\nimport 'react'\n`
    ),
    'APPLICATION_RUNTIME_IMPORT'
  ),
  requireMutation(
    'domain direction',
    mutate(
      fixtures.workItems,
      'src/modules/work-items/domain/work-item.ts',
      (source) => `${source}\nimport '../server.js'\n`
    ),
    'DOMAIN_DIRECTION'
  ),
  requireMutation(
    'client server import',
    mutate(
      fixtures.workItems,
      'src/modules/work-items/client.ts',
      (source) => `${source}\nimport './server.js'\n`
    ),
    'CLIENT_SERVER_IMPORT'
  ),
  requireMutation(
    'server client import',
    mutate(
      fixtures.workItems,
      'src/modules/work-items/server.ts',
      (source) => `${source}\nimport './client.js'\n`
    ),
    'SERVER_CLIENT_IMPORT'
  ),
  requireMutation(
    'barrel-only public surface',
    mutate(
      fixtures.workItems,
      'src/modules/work-items/server.ts',
      () => "export * from './server/service.js'\n"
    ),
    'PUBLIC_BARREL_ONLY'
  ),
  requireMutation(
    'port direction',
    mutate(
      fixtures.assistant,
      'src/modules/assistant/application/ports/text-generator.ts',
      (source) => `${source}\nimport '../../server/provider.js'\n`
    ),
    'PORT_DIRECTION'
  ),
  requireMutation(
    'module cycle',
    mutate(
      fixtures.board,
      'src/modules/work-items/server.ts',
      (source) => `${source}\nimport '../board/server.js'\n`
    ),
    'MODULE_CYCLE'
  ),
].filter(Boolean)

fail([
  ...errors.map((error) => `${error.code} ${error.file}: ${error.message}`),
  ...mutations,
])
console.log('capability pilots ok (6 invariants, 10 failing mutations)')
