#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import ts from 'typescript'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error(`Usage: node scripts/measure-evidence.mjs [options] name=/repo#ref [...]
  --use-cases-root=src/use-cases
  --ui-root=src/ui
  --adapters-root=src/adapters
  --outbound-api-root=src/adapters/outbound/api`)
  process.exit(2)
}

function parseRoot(raw, option) {
  const value = raw.replace(/\/+$/, '')
  if (
    value === '' ||
    path.posix.isAbsolute(value) ||
    value.includes('\\') ||
    value.includes('*') ||
    path.posix.normalize(value) !== value ||
    value.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`${option} must be a normalized repository-relative directory: ${raw}`)
  }
  return value
}

function parseArguments(input) {
  const options = {
    useCasesRoot: 'src/use-cases',
    uiRoot: 'src/ui',
    adaptersRoot: 'src/adapters',
    outboundApiRoot: 'src/adapters/outbound/api',
  }
  const specs = []
  for (const arg of input) {
    if (arg.startsWith('--use-cases-root=')) {
      options.useCasesRoot = parseRoot(arg.slice('--use-cases-root='.length), '--use-cases-root')
      continue
    }
    if (arg.startsWith('--ui-root=')) {
      options.uiRoot = parseRoot(arg.slice('--ui-root='.length), '--ui-root')
      continue
    }
    if (arg.startsWith('--adapters-root=')) {
      options.adaptersRoot = parseRoot(arg.slice('--adapters-root='.length), '--adapters-root')
      continue
    }
    if (arg.startsWith('--outbound-api-root=')) {
      options.outboundApiRoot = parseRoot(
        arg.slice('--outbound-api-root='.length),
        '--outbound-api-root'
      )
      continue
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`)
    specs.push(arg)
  }
  if (specs.length === 0) throw new Error('At least one repository spec is required')
  return { options, specs }
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

function unwrapExpression(expression) {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function callableBody(expression) {
  const current = unwrapExpression(expression)
  return ts.isArrowFunction(current) || ts.isFunctionExpression(current)
    ? current.body
    : undefined
}

function callableBodies(source) {
  const bodies = []
  const exportedNames = new Set()

  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) exportedNames.add((element.propertyName ?? element.name).text)
      }
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = unwrapExpression(statement.expression)
      if (ts.isIdentifier(expression)) exportedNames.add(expression.text)
    }
  }

  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.body &&
      (isExported(statement) || (statement.name && exportedNames.has(statement.name.text)))
    ) {
      bodies.push(statement.body)
      continue
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const exported =
          (isExported(statement) && ts.isIdentifier(declaration.name)) ||
          (ts.isIdentifier(declaration.name) && exportedNames.has(declaration.name.text))
        const body = declaration.initializer && callableBody(declaration.initializer)
        if (exported && body) bodies.push(body)
      }
      continue
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const body = callableBody(statement.expression)
      if (body) bodies.push(body)
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

function importsRoot(file, specifier, targetRoot) {
  const aliasRoot = targetRoot.replace(/^src\//, '')
  if (specifier.startsWith(`@/${aliasRoot}/`) || specifier === `@/${aliasRoot}`) return true
  if (!specifier.startsWith('.')) return false
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
  return resolved.startsWith(`${targetRoot}/`) || resolved === targetRoot
}

function measure(spec, options) {
  const sha = git(spec.repo, 'rev-parse', spec.ref)
  const useCaseFiles = listFiles(spec.repo, sha, [options.useCasesRoot]).filter(
    (file) =>
      (file.endsWith('.ts') || file.endsWith('.tsx')) &&
      !file.endsWith('.d.ts') &&
      !file.includes('/__tests__/') &&
      !file.includes('.test.') &&
      !file.includes('.spec.') &&
      !['ports.ts', 'types.ts'].includes(path.basename(file))
  )
  if (useCaseFiles.length === 0) {
    throw new Error(
      `${spec.name}: no TypeScript application files found under ${options.useCasesRoot} at ${sha}; configure --use-cases-root`
    )
  }
  const uiFiles = listFiles(spec.repo, sha, [options.uiRoot]).filter(
    (file) =>
      (file.endsWith('.ts') || file.endsWith('.tsx')) &&
      !file.endsWith('.d.ts') &&
      !file.includes('/__tests__/') &&
      !file.includes('.test.') &&
      !file.includes('.spec.')
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
    if (imports(source).some((specifier) => importsRoot(file, specifier, options.adaptersRoot))) {
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
      imports(source).some((specifier) =>
        importsRoot(file, specifier, options.outboundApiRoot)
      )
    ) {
      uiOutboundApiImports.add(file)
    }
  }

  return {
    name: spec.name,
    repo: spec.repo,
    ref: spec.ref,
    sha,
    useCasesRoot: options.useCasesRoot,
    uiRoot: options.uiRoot,
    adaptersRoot: options.adaptersRoot,
    outboundApiRoot: options.outboundApiRoot,
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
  const { options, specs } = parseArguments(args)
  console.log(JSON.stringify(specs.map(parseSpec).map((spec) => measure(spec, options)), null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
