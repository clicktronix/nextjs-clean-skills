#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import ts from 'typescript'

const specs = process.argv.slice(2)

if (specs.length === 0) {
  console.error(
    'Usage: node scripts/measure-evidence.mjs name=/absolute/repo/path#git-ref [...]'
  )
  process.exit(2)
}

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trim()
}

function parseSpec(spec) {
  const equals = spec.indexOf('=')
  const hash = spec.lastIndexOf('#')
  if (equals < 1 || hash <= equals + 1 || hash === spec.length - 1) {
    throw new Error(`Invalid repository spec: ${spec}`)
  }
  return {
    name: spec.slice(0, equals),
    repo: spec.slice(equals + 1, hash),
    ref: spec.slice(hash + 1),
  }
}

function listFiles(repo, ref, roots) {
  const output = git(repo, 'ls-tree', '-r', '--name-only', ref, '--', ...roots)
  return output === '' ? [] : output.split('\n')
}

function readSource(repo, ref, file) {
  return git(repo, 'show', `${ref}:${file}`)
}

function isExported(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function callableBodies(source) {
  const bodies = []
  for (const statement of source.statements) {
    if (!isExported(statement)) continue
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      bodies.push(statement.body)
      continue
    }
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer
      if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
        bodies.push(initializer.body)
      }
    }
  }
  return bodies
}

function statementCount(body) {
  return ts.isBlock(body) ? body.statements.length : 1
}

function returnedExpression(body) {
  if (!ts.isBlock(body)) return body
  if (body.statements.length !== 1 || !ts.isReturnStatement(body.statements[0])) return undefined
  return body.statements[0].expression
}

function callRoot(expression) {
  let current = expression
  if (!current) return undefined
  if (ts.isAwaitExpression(current)) current = current.expression
  if (!ts.isCallExpression(current)) return undefined
  current = current.expression
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression
  }
  return ts.isIdentifier(current) ? current.text : undefined
}

function directCallCounts(source) {
  const counts = { assertValidUuid: 0, parse: 0 }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'assertValidUuid' || node.expression.text === 'assertValidUuidOrNull') {
        counts.assertValidUuid += 1
      }
      if (node.expression.text === 'parse') counts.parse += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return counts
}

function imports(source) {
  return source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((literal) => literal.text)
}

function importsLayer(file, specifier, layer) {
  if (specifier.startsWith(`@/${layer}/`) || specifier === `@/${layer}`) return true
  if (!specifier.startsWith('.')) return false
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
  return resolved.startsWith(`src/${layer}/`) || resolved === `src/${layer}`
}

function measure(spec) {
  const sha = git(spec.repo, 'rev-parse', spec.ref)
  const useCaseFiles = listFiles(spec.repo, sha, ['src/use-cases']).filter(
    (file) =>
      file.endsWith('.ts') &&
      !file.includes('__tests__') &&
      !file.endsWith('.test.ts') &&
      !['ports.ts', 'types.ts'].includes(path.basename(file))
  )
  const uiFiles = listFiles(spec.repo, sha, ['src/ui']).filter(
    (file) => file.endsWith('.ts') || file.endsWith('.tsx')
  )

  let exportedCallables = 0
  let depsForwards = 0
  let atMostTwoStatements = 0
  let moreThanSixStatements = 0
  let uuidAssertions = 0
  let schemaParses = 0
  const useCaseAdapterImports = new Set()
  const uiOutboundApiImports = new Set()

  for (const file of useCaseFiles) {
    const source = ts.createSourceFile(
      file,
      readSource(spec.repo, sha, file),
      ts.ScriptTarget.Latest,
      true
    )
    const bodies = callableBodies(source)
    exportedCallables += bodies.length
    depsForwards += bodies.filter((body) => callRoot(returnedExpression(body)) === 'deps').length
    atMostTwoStatements += bodies.filter((body) => statementCount(body) <= 2).length
    moreThanSixStatements += bodies.filter((body) => statementCount(body) > 6).length

    const calls = directCallCounts(source)
    uuidAssertions += calls.assertValidUuid
    schemaParses += calls.parse
    if (imports(source).some((specifier) => importsLayer(file, specifier, 'adapters'))) {
      useCaseAdapterImports.add(file)
    }
  }

  for (const file of uiFiles) {
    const source = ts.createSourceFile(
      file,
      readSource(spec.repo, sha, file),
      ts.ScriptTarget.Latest,
      true
    )
    if (
      imports(source).some((specifier) => importsLayer(file, specifier, 'adapters/outbound/api'))
    ) {
      uiOutboundApiImports.add(file)
    }
  }

  return {
    name: spec.name,
    repo: spec.repo,
    ref: spec.ref,
    sha,
    useCaseFiles: useCaseFiles.length,
    exportedCallables,
    depsForwards,
    atMostTwoStatements,
    moreThanSixStatements,
    uuidAssertions,
    schemaParses,
    useCaseFilesImportingAdapters: useCaseAdapterImports.size,
    uiFilesImportingOutboundApi: uiOutboundApiImports.size,
  }
}

try {
  console.log(JSON.stringify(specs.map(parseSpec).map(measure), null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
