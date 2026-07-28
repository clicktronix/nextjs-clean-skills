#!/usr/bin/env node
import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import ts from 'typescript'

import { fail, readJson, root } from './_lib.mjs'

const fixturesRoot = path.join(root, 'tests/architecture-pilots/fixtures')
const contract = readJson('rules/architecture-contract.json')
const contractErrors = []

function stringArray(name) {
  const value = contract[name]
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    contractErrors.push(`architecture-contract.json ${name} must be an array of strings`)
    return []
  }
  if (new Set(value).size !== value.length) {
    contractErrors.push(`architecture-contract.json ${name} contains duplicate values`)
  }
  return value
}

function requireSubset(name, values, parentName, parentValues) {
  const parent = new Set(parentValues)
  for (const value of values) {
    if (!parent.has(value)) {
      contractErrors.push(
        `architecture-contract.json ${name} contains ${value}, which is absent from ${parentName}`
      )
    }
  }
}

function requireDisjoint(leftName, leftValues, rightName, rightValues) {
  const right = new Set(rightValues)
  for (const value of leftValues) {
    if (right.has(value)) {
      contractErrors.push(
        `architecture-contract.json ${leftName} and ${rightName} both classify ${value}`
      )
    }
  }
}

const segments = stringArray('segments')
const publicSurfaces = stringArray('publicSurfaces')
const serverSurfaces = stringArray('serverSurfaces')
const serverExecutionSurfaces = stringArray('serverExecutionSurfaces')
const clientSurfaces = stringArray('clientSurfaces')
const neutralSurfaces = contract.neutralSurfaces
  ? stringArray('neutralSurfaces')
  : []
const runtimePackages = stringArray('runtimePackages')

requireSubset('serverSurfaces', serverSurfaces, 'publicSurfaces', publicSurfaces)
requireSubset(
  'serverExecutionSurfaces',
  serverExecutionSurfaces,
  'publicSurfaces',
  publicSurfaces
)
requireSubset('clientSurfaces', clientSurfaces, 'publicSurfaces', publicSurfaces)
requireSubset('neutralSurfaces', neutralSurfaces, 'publicSurfaces', publicSurfaces)
requireSubset(
  'serverSurfaces',
  serverSurfaces,
  'serverExecutionSurfaces',
  serverExecutionSurfaces
)
requireDisjoint('neutralSurfaces', neutralSurfaces, 'serverExecutionSurfaces', serverExecutionSurfaces)
requireDisjoint('neutralSurfaces', neutralSurfaces, 'clientSurfaces', clientSurfaces)
requireDisjoint('serverSurfaces', serverSurfaces, 'clientSurfaces', clientSurfaces)

const segmentNames = new Set(segments)
const publicSurfaceNames = new Set(publicSurfaces.map((surface) => `${surface}.ts`))
const serverSurfaceNames = new Set(serverSurfaces.map((surface) => `${surface}.ts`))
const serverExecutionSurfaceNames = new Set(
  serverExecutionSurfaces.map((surface) => `${surface}.ts`)
)
const clientSurfaceNames = new Set(clientSurfaces.map((surface) => `${surface}.ts`))
const neutralSurfaceNames = new Set(neutralSurfaces.map((surface) => `${surface}.ts`))
const applicationRuntimeSurfaceNames = new Set([
  ...serverExecutionSurfaceNames,
  ...clientSurfaceNames,
  ...neutralSurfaceNames,
])
const serverSegmentNames = new Set(segments.filter((segment) => serverSurfaces.includes(segment)))
const clientSegmentNames = new Set(segments.filter((segment) => clientSurfaces.includes(segment)))
const runtimePackageNames = new Set(runtimePackages)
const nodeBuiltinNames = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))

function isRuntimePackage(specifier) {
  const builtin = specifier.replace(/^node:/, '').split('/')[0]
  if (nodeBuiltinNames.has(builtin)) return true
  for (const packageName of runtimePackageNames) {
    if (specifier === packageName || specifier.startsWith(`${packageName}/`)) return true
  }
  return false
}

function listTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return listTypeScriptFiles(absolute)
    return /\.tsx?$/.test(entry.name) ? [absolute] : []
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

function sharedLocation(file, fixtureRoot) {
  const parts = path.relative(fixtureRoot, file).split(path.sep)
  if (parts[0] !== 'src' || parts[1] !== 'shared' || parts.length < 3) return null
  return { root: parts[2] }
}

function hasUseClientDirective(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  return parsed.statements.some(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === 'use client'
  )
}

function runtimeSide(file, source, owner, fixtureRoot) {
  const sourceSegment = owner?.tail.length > 1 ? owner.tail[0] : null
  const sourceRoot = owner?.tail.length === 1 ? owner.tail[0] : null
  if (
    hasUseClientDirective(file, source) ||
    clientSegmentNames.has(sourceSegment) ||
    clientSurfaceNames.has(sourceRoot)
  ) {
    return 'client'
  }
  if (
    serverSegmentNames.has(sourceSegment) ||
    serverExecutionSurfaceNames.has(sourceRoot)
  ) {
    return 'server'
  }
  const parts = path.relative(fixtureRoot, file).split(path.sep)
  if (parts[0] === 'src' && parts[1] === 'app') return 'server'
  return null
}

function neutralConsumerSide(file, source, owner, fixtureRoot) {
  const sourceSegment = owner?.tail.length > 1 ? owner.tail[0] : null
  const sourceRoot = owner?.tail.length === 1 ? owner.tail[0] : null
  if (
    hasUseClientDirective(file, source) ||
    clientSegmentNames.has(sourceSegment) ||
    clientSurfaceNames.has(sourceRoot)
  ) {
    return 'client'
  }
  if (sourceRoot === 'rsc.ts') return 'server'

  const parts = path.relative(fixtureRoot, file).split(path.sep)
  if (
    parts[0] === 'src' &&
    parts[1] === 'app' &&
    !['route.ts', 'route.tsx', 'actions.ts', 'actions.tsx'].includes(parts.at(-1))
  ) {
    return 'server'
  }
  return null
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

function consumerImportSpecifiers(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const specifiers = []

  function visit(node) {
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

function resolveRelativeImport(importer, specifier, sources) {
  if (!specifier.startsWith('.')) return null
  const unresolved = path.resolve(path.dirname(importer), specifier)
  const withoutJavaScriptExtension = unresolved.replace(/\.jsx?$/, '')
  const candidates = [
    unresolved,
    `${withoutJavaScriptExtension}.ts`,
    `${withoutJavaScriptExtension}.tsx`,
    path.join(unresolved, 'index.ts'),
    path.join(unresolved, 'index.tsx'),
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
  const neutralConsumers = new Map()

  const addError = (code, file, message) => {
    errors.push({
      code,
      file: path.relative(root, file).split(path.sep).join('/'),
      message,
    })
  }

  for (const file of sources.keys()) {
    const owner = moduleLocation(file, fixtureRoot)
    if (
      owner?.tail.length === 1 &&
      neutralSurfaceNames.has(owner.tail[0])
    ) {
      neutralConsumers.set(file, new Set())
    }
  }

  for (const [file, source] of sources) {
    const owner = moduleLocation(file, fixtureRoot)
    const sourceSide = runtimeSide(file, source, owner, fixtureRoot)
    const neutralSide = neutralConsumerSide(file, source, owner, fixtureRoot)
    const consumedSpecifiers = new Set(consumerImportSpecifiers(file, source))

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

    if (
      owner &&
      owner.tail.length === 2 &&
      segmentNames.has(owner.tail[0]) &&
      publicSurfaceNames.has(`${owner.tail[0]}.ts`) &&
      /^index\.tsx?$/.test(owner.tail[1])
    ) {
      addError(
        'SHADOWED_SEGMENT_INDEX',
        file,
        `${owner.tail.join('/')} is shadowed by the ${owner.tail[0]}.ts root surface`
      )
    }

    for (const specifier of importSpecifiers(file, source)) {
      const sourceSegment = owner?.tail.length > 1 ? owner.tail[0] : null
      const sourceRoot = owner?.tail.length === 1 ? owner.tail[0] : null
      if (!specifier.startsWith('.') && neutralSurfaceNames.has(sourceRoot)) {
        addError(
          'NEUTRAL_SURFACE_DIRECTION',
          file,
          `runtime-neutral surface imports package ${specifier}`
        )
      }
      if (
        !specifier.startsWith('.') &&
        ['domain', 'application'].includes(sourceSegment) &&
        isRuntimePackage(specifier)
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
      const targetShared = sharedLocation(target, fixtureRoot)

      if (
        sourceSegment === 'server' &&
        targetOwner?.moduleName === owner.moduleName &&
        targetOwner.tail.length === 1 &&
        publicSurfaceNames.has(targetOwner.tail[0])
      ) {
        addError(
          'PRIVATE_SERVER_BACKEDGE',
          file,
          `private server implementation imports public surface ${specifier}`
        )
      }

      if (neutralSurfaceNames.has(sourceRoot)) {
        const ownDomain =
          targetOwner?.moduleName === owner.moduleName && targetOwner.tail[0] === 'domain'
        if (!ownDomain && targetShared?.root !== 'kernel') {
          addError(
            'NEUTRAL_SURFACE_DIRECTION',
            file,
            `runtime-neutral surface imports ${specifier}`
          )
        }
      }

      if (
        targetOwner?.tail.length === 1 &&
        neutralSurfaceNames.has(targetOwner.tail[0]) &&
        neutralSide &&
        consumedSpecifiers.has(specifier)
      ) {
        neutralConsumers.get(target)?.add(neutralSide)
      }

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
        if (
          owner.tail[1] === 'ports' &&
          (serverSegmentNames.has(targetSegment) || clientSegmentNames.has(targetSegment))
        ) {
          addError('PORT_DIRECTION', file, `application port imports ${targetSegment}`)
        } else if (
          serverSegmentNames.has(targetSegment) ||
          clientSegmentNames.has(targetSegment) ||
          applicationRuntimeSurfaceNames.has(targetRoot)
        ) {
          addError('APPLICATION_RUNTIME_IMPORT', file, `application imports ${specifier}`)
        }
      }

      const sourceIsClient =
        clientSegmentNames.has(sourceSegment) || clientSurfaceNames.has(owner.tail[0])
      const targetIsServer =
        serverSegmentNames.has(targetSegment) || serverSurfaceNames.has(targetRoot)
      const sourceIsServer =
        serverSegmentNames.has(sourceSegment) ||
        serverExecutionSurfaceNames.has(owner.tail[0])
      const targetIsClient =
        clientSegmentNames.has(targetSegment) || clientSurfaceNames.has(targetRoot)
      if (sourceIsClient && targetIsServer) {
        addError('CLIENT_SERVER_IMPORT', file, `browser-safe code imports ${specifier}`)
      }
      if (sourceIsServer && targetIsClient) {
        addError('SERVER_CLIENT_IMPORT', file, `server code imports ${specifier}`)
      }
    }
  }

  for (const [file, consumers] of neutralConsumers) {
    if (!consumers.has('server') || !consumers.has('client')) {
      addError(
        'NEUTRAL_SURFACE_ONE_SIDED',
        file,
        'runtime-neutral surface requires both a server prefetch/hydration consumer and a client query consumer'
      )
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

function addSource(fixture, relativeFile, source) {
  const file = path.join(fixturesRoot, fixture.fixtureId, relativeFile)
  return {
    ...fixture,
    sources: new Map(fixture.sources).set(file, source),
  }
}

function requireMutation(label, fixture, expectedCode) {
  const errors = analyzeFixture(fixture)
  if (!errors.some((error) => error.code === expectedCode)) {
    return `${label}: expected ${expectedCode}, received ${errors.map((error) => error.code).join(', ')}`
  }
  return null
}

const workItemsFixture = loadFixture('work-items')
const queryCacheFixture = addSource(
  mutate(
    mutate(
      workItemsFixture,
      'src/modules/work-items/rsc.ts',
      (source) => `import { workItemKeys } from './query-cache.js'\n${source}
export const workItemsRscQueryKey = workItemKeys.list()
`
    ),
    'src/modules/work-items/client.ts',
    (source) => `import { workItemKeys } from './query-cache.js'\n${source}
export const workItemsClientQueryKey = workItemKeys.list()
`
  ),
  'src/modules/work-items/query-cache.ts',
  `import type { WorkItem } from './domain/work-item.js'

export const workItemKeys = {
  all: ['work-items'] as const,
  list: () => [...workItemKeys.all, 'list'] as const,
  detail: (id: WorkItem['id']) => [...workItemKeys.all, 'detail', id] as const,
}
`
)

const fixtures = {
  assistant: loadFixture('assistant-stream'),
  board: loadFixture('board-workflow'),
  workItems: workItemsFixture,
  queryCache: queryCacheFixture,
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
    'application imports another capability runtime surface',
    mutate(
      fixtures.board,
      'src/modules/board/application/ports.ts',
      (source) => `${source}\nimport type { WorkItemsServer } from '../../work-items/server.js'\n`
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
    'domain database package from contract',
    mutate(
      fixtures.workItems,
      'src/modules/work-items/domain/work-item.ts',
      (source) => `${source}\nimport 'drizzle-orm'\n`
    ),
    'DOMAIN_DIRECTION'
  ),
  requireMutation(
    'application scoped provider package from contract',
    mutate(
      fixtures.assistant,
      'src/modules/assistant/application/generate-response.ts',
      (source) => `${source}\nimport '@prisma/client'\n`
    ),
    'APPLICATION_RUNTIME_IMPORT'
  ),
  requireMutation(
    'application cache provider package from contract',
    mutate(
      fixtures.assistant,
      'src/modules/assistant/application/generate-response.ts',
      (source) => `${source}\nimport 'ioredis'\n`
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
    'segment index shadowed by root surface',
    addSource(
      fixtures.workItems,
      'src/modules/work-items/server/index.tsx',
      'export const shadowed = true\n'
    ),
    'SHADOWED_SEGMENT_INDEX'
  ),
  requireMutation(
    'runtime-neutral surface imports a runtime package',
    mutate(
      fixtures.queryCache,
      'src/modules/work-items/query-cache.ts',
      (source) => `${source}\nimport 'next/cache'\n`
    ),
    'NEUTRAL_SURFACE_DIRECTION'
  ),
  requireMutation(
    'runtime-neutral surface imports server internals',
    mutate(
      fixtures.queryCache,
      'src/modules/work-items/query-cache.ts',
      (source) => `${source}\nimport './server/store.js'\n`
    ),
    'NEUTRAL_SURFACE_DIRECTION'
  ),
  requireMutation(
    'runtime-neutral surface has only a client consumer',
    mutate(
      fixtures.queryCache,
      'src/modules/work-items/rsc.ts',
      (source) =>
        source
          .replace("import { workItemKeys } from './query-cache.js'\n", '')
          .replace('\nexport const workItemsRscQueryKey = workItemKeys.list()\n', '\n')
    ),
    'NEUTRAL_SURFACE_ONE_SIDED'
  ),
  requireMutation(
    'a client re-export does not count as a query consumer',
    mutate(
      fixtures.queryCache,
      'src/modules/work-items/client.ts',
      () => "export { workItemKeys } from './query-cache.js'\n"
    ),
    'NEUTRAL_SURFACE_ONE_SIDED'
  ),
  requireMutation(
    'private server implementation imports its action surface',
    mutate(
      fixtures.workItems,
      'src/modules/work-items/server/store.ts',
      (source) => `${source}\nimport '../actions.js'\n`
    ),
    'PRIVATE_SERVER_BACKEDGE'
  ),
  requireMutation(
    'action invalidation does not count as server prefetch',
    mutate(
      mutate(
        fixtures.queryCache,
        'src/modules/work-items/rsc.ts',
        (source) =>
          source
            .replace("import { workItemKeys } from './query-cache.js'\n", '')
            .replace('\nexport const workItemsRscQueryKey = workItemKeys.list()\n', '\n')
      ),
      'src/modules/work-items/actions.ts',
      (source) =>
        `${source}\nimport { workItemKeys } from './query-cache.js'\nexport const invalidatedKey = workItemKeys.list()\n`
    ),
    'NEUTRAL_SURFACE_ONE_SIDED'
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
  ...contractErrors,
  ...errors.map((error) => `${error.code} ${error.file}: ${error.message}`),
  ...mutations,
])
console.log('capability pilots ok (10 invariants, 20 failing mutations)')
