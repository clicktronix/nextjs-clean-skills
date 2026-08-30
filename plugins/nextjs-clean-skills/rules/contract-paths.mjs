import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const posix = (value) => value.split(path.sep).join('/')

function findProjectRoot(start) {
  let current = start
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error('Cannot find package.json above architecture rules')
    }
    current = parent
  }
}

function projectPath(projectRoot, name, value) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) {
    throw new Error(`${name} must be a non-empty project-relative path`)
  }
  const absolute = path.resolve(projectRoot, value)
  const relative = path.relative(projectRoot, absolute)
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`${name} must stay inside the project root`)
  }
  return absolute
}

function aliases(projectRoot, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('importAliases must be an object of prefix-to-path entries')
  }
  const entries = Object.entries(value)
  return entries
    .map(([prefix, target]) => {
      if (!prefix || typeof target !== 'string' || target.length === 0) {
        throw new Error('importAliases entries require a non-empty prefix and path')
      }
      // A prefix without its separator swallows every specifier that merely starts with
      // the same characters: `@` claims `@supabase/supabase-js` as a project path, and the
      // remainder of `@/modules/x` becomes `/modules/x`, which path.resolve treats as
      // absolute and resolves outside the project. Both silence the boundary and cycle
      // rules rather than failing them, so the shape is a contract error, not a warning.
      if (!prefix.endsWith('/')) {
        throw new Error(`importAliases.${prefix} must end with '/' (for example '@/')`)
      }
      return [prefix, projectPath(projectRoot, `importAliases.${prefix}`, target)]
    })
    .sort(([left], [right]) => right.length - left.length)
}

export function loadArchitecturePaths(metaUrl, rootOverride) {
  const moduleDirectory = path.dirname(fileURLToPath(metaUrl))
  const projectRoot = rootOverride
    ? path.resolve(rootOverride)
    : findProjectRoot(moduleDirectory)
  const adjacentContract = path.join(moduleDirectory, 'architecture-contract.json')
  const contractPath = rootOverride
    ? path.join(projectRoot, 'rules', 'architecture-contract.json')
    : fs.existsSync(adjacentContract)
      ? adjacentContract
      : path.join(projectRoot, 'rules', 'architecture-contract.json')
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
  const sourceRoot = projectPath(projectRoot, 'sourceRoot', contract.sourceRoot)
  const moduleRoot = projectPath(projectRoot, 'moduleRoot', contract.moduleRoot)
  const appRoot = projectPath(projectRoot, 'appRoot', contract.appRoot)
  const sharedRoot = projectPath(projectRoot, 'sharedRoot', contract.sharedRoot)
  const generatedRoot = contract.generatedRoot
    ? projectPath(projectRoot, 'generatedRoot', contract.generatedRoot)
    : null

  for (const [name, root] of [
    ['moduleRoot', moduleRoot],
    ['appRoot', appRoot],
    ['sharedRoot', sharedRoot],
    ...(generatedRoot ? [['generatedRoot', generatedRoot]] : []),
  ]) {
    if (!isWithin(sourceRoot, root)) {
      throw new Error(`${name} must stay inside sourceRoot`)
    }
  }

  const ownedRoots = [
    ['moduleRoot', moduleRoot],
    ['appRoot', appRoot],
    ['sharedRoot', sharedRoot],
  ]
  for (let leftIndex = 0; leftIndex < ownedRoots.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ownedRoots.length; rightIndex += 1) {
      const [leftName, leftRoot] = ownedRoots[leftIndex]
      const [rightName, rightRoot] = ownedRoots[rightIndex]
      if (isWithin(leftRoot, rightRoot) || isWithin(rightRoot, leftRoot)) {
        throw new Error(`${leftName} and ${rightName} must not overlap`)
      }
    }
  }

  return {
    contract,
    projectRoot,
    sourceRoot,
    moduleRoot,
    appRoot,
    sharedRoot,
    generatedRoot,
    importAliases: aliases(projectRoot, contract.importAliases),
  }
}

export function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

export function relativeParts(root, candidate) {
  if (!isWithin(root, candidate)) return null
  const relative = posix(path.relative(root, candidate))
  return relative ? relative.split('/') : []
}

export function resolveProjectImport(paths, importer, specifier) {
  if (specifier.startsWith('.')) return path.resolve(path.dirname(importer), specifier)
  const alias = paths.importAliases.find(([prefix]) => specifier.startsWith(prefix))
  if (!alias) return null
  // The remainder cannot begin with a separator, and so cannot make path.resolve discard
  // the alias target: prefixes are required to end with one (see aliases()).
  return path.resolve(alias[1], specifier.slice(alias[0].length))
}

// Every extension a project source file can carry. ESLint and cycle detection share this inventory.
export const SOURCE_EXTENSIONS = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']

export function sourceFilesPattern(paths) {
  const relative = posix(path.relative(paths.projectRoot, paths.sourceRoot))
  return `${relative ? `${relative}/` : ''}**/*.{${SOURCE_EXTENSIONS.join(',')}}`
}

export { posix }

/**
 * Every static module-loading form, with its kind. Callers decide whether type-only edges matter;
 * cycle detection keeps them because the contract requires an acyclic module graph.
 */
export function moduleEdges(parsed) {
  const edges = []
  const literal = (node) => (node && ts.isStringLiteralLike(node) ? node.text : null)
  const push = (node, typeOnly) => {
    const specifier = literal(node)
    if (specifier !== null) edges.push({ specifier, typeOnly })
  }
  // `require` and `module.require` / `module['require']`, and nothing else. Accepting any property
  // access named `require` read `loader.require(name)` — an ordinary method call on somebody's
  // object — as a module edge.
  const isRequireTarget = (expression) => {
    if (ts.isIdentifier(expression)) return expression.text === 'require'
    const receiver = ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
    if (!receiver) return false
    if (!ts.isIdentifier(expression.expression) || expression.expression.text !== 'module') return false
    return ts.isPropertyAccessExpression(expression)
      ? ts.isIdentifier(expression.name) && expression.name.text === 'require'
      : literal(expression.argumentExpression) === 'require'
  }
  // `every()` on an empty list is true, so `import {} from './x'` and `export {} from './x'` were
  // classified as entirely type-only and dropped. They import nothing by name and still load the
  // module for its side effects, which is a value edge.
  const allTypeOnly = (elements) => elements.length > 0 && elements.every((element) => element.isTypeOnly)
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      const typeOnly = Boolean(
        clause &&
          (clause.isTypeOnly ||
            (!clause.name && bindings && ts.isNamedImports(bindings) && allTypeOnly(bindings.elements)))
      )
      push(node.moduleSpecifier, typeOnly)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const clause = node.exportClause
      const typeOnly = Boolean(
        node.isTypeOnly || (clause && ts.isNamedExports(clause) && allTypeOnly(clause.elements))
      )
      push(node.moduleSpecifier, typeOnly)
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      push(node.moduleReference.expression, Boolean(node.isTypeOnly))
    }
    if (ts.isCallExpression(node)) {
      // `import(specifier, options)` is a two-argument call in current TypeScript; requiring exactly
      // one argument made the import-attributes form invisible.
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length >= 1) {
        push(node.arguments[0], false)
      } else if (isRequireTarget(node.expression) && node.arguments.length === 1) {
        push(node.arguments[0], false)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return edges
}

/** Specifier strings. `valueOnly` drops type-only edges, which is the runtime view. */
export function moduleSpecifiers(parsed, { valueOnly = false } = {}) {
  return moduleEdges(parsed)
    .filter((edge) => !valueOnly || !edge.typeOnly)
    .map((edge) => edge.specifier)
}

// Development artifacts do not participate in the production capability graph. Project conventions
// may override the default suffixes and directories.
const DEV_SUFFIXES = ['test', 'spec', 'stories', 'mock', 'mocks', 'fixture', 'fixtures']
const DEV_DIRECTORIES = ['__tests__', '__mocks__', '__fixtures__', 'test', 'tests', 'mocks', 'fixtures']

export function developmentArtifactPredicate({ contract, projectRoot }) {
  const suffixes = contract.developmentArtifactSuffixes ?? DEV_SUFFIXES
  const directories = new Set(contract.developmentArtifactDirectories ?? DEV_DIRECTORIES)
  const suffixed = new RegExp(`\\.(${suffixes.join('|')})\\.(${SOURCE_EXTENSIONS.join('|')})$`)
  return (file) =>
    suffixed.test(path.basename(file)) ||
    path.relative(projectRoot, file).split(path.sep).some((part) => directories.has(part))
}
