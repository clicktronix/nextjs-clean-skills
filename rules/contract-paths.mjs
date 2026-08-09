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

  for (const [name, root] of [
    ['moduleRoot', moduleRoot],
    ['appRoot', appRoot],
    ['sharedRoot', sharedRoot],
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

/**
 * Resolve a specifier to a file that exists on disk, or null.
 *
 * One resolver, because two were worse than one: the admission check knew about directory `index`
 * files but not about `./x.js` specifiers that mean `x.ts`, and the neutral-surface check knew the
 * opposite. Each was blind exactly where the other could see, and the admission one's blindness had
 * teeth — an unresolvable import means "nothing imports this file", and that verdict is `unused`,
 * which tells you to delete live code.
 */
export function resolveToExistingFile(paths, importer, specifier) {
  const base = resolveProjectImport(paths, importer, specifier)
  if (!base) return null
  const isFile = candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  // An emitted specifier maps back to the source that produces it, and the mapping is PER
  // EXTENSION: `./x.mjs` is `x.mts`, never `x.ts`. One shared substitution list picked files
  // TypeScript would not have picked and omitted declaration files entirely, so a live import
  // resolved to nothing — and a target with no resolvable importer reads as unused, which is how
  // the admission check came to recommend deleting code that was in use.
  const emitted = Object.keys(EMITTED_SOURCES).find(extension => base.endsWith(extension))
  if (emitted) {
    const stem = base.slice(0, -emitted.length)
    for (const extension of EMITTED_SOURCES[emitted]) {
      if (isFile(`${stem}${extension}`)) return `${stem}${extension}`
    }
    // `./dir.js/index.ts` is not a resolution TypeScript performs, so an emitted specifier that
    // matched no source is the end of the search, not a directory to look inside.
    return null
  }
  if (isFile(base)) return base
  for (const extension of EXTENSIONLESS_SOURCES) {
    if (isFile(`${base}${extension}`)) return `${base}${extension}`
  }
  for (const extension of EXTENSIONLESS_SOURCES) {
    if (isFile(path.join(base, `index${extension}`))) return path.join(base, `index${extension}`)
  }
  return null
}

// Every extension a project source file can carry. The ESLint glob and the resolver share it: they
// disagreed, and the glob was the narrower — so an `.mts` file was invisible to the boundary rules
// while the resolver happily resolved imports into it.
export const SOURCE_EXTENSIONS = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']
const EMITTED_SOURCES = {
  '.js': ['.ts', '.tsx', '.d.ts', '.js', '.jsx'],
  '.jsx': ['.tsx', '.d.ts', '.jsx'],
  '.mjs': ['.mts', '.d.mts', '.mjs'],
  '.cjs': ['.cts', '.d.cts', '.cjs'],
}
const EXTENSIONLESS_SOURCES = [
  '.ts', '.tsx', '.d.ts', '.mts', '.d.mts', '.cts', '.d.cts', '.js', '.jsx', '.mjs', '.cjs',
]

export function sourceFilesPattern(paths) {
  const relative = posix(path.relative(paths.projectRoot, paths.sourceRoot))
  return `${relative ? `${relative}/` : ''}**/*.{${SOURCE_EXTENSIONS.join(',')}}`
}

export { posix }

/**
 * Every static module-loading form, in one place. Each checker grew its own extractor and each
 * missed something different: a no-substitution template (`import(`./x`)`) is a compile-time
 * constant that `ts.isStringLiteral` rejects, and `module.require('./x')` is a require by another
 * name. A specifier the extractor does not see is an edge the graph does not have — which reads as
 * "no importer, delete it" in one check and as a missing runtime consumer in another.
 */
export function moduleSpecifiers(parsed) {
  const specifiers = []
  const literal = (node) => (node && ts.isStringLiteralLike(node) ? node.text : null)
  const push = (node) => {
    const text = literal(node)
    if (text !== null) specifiers.push(text)
  }
  const isRequireTarget = (expression) =>
    (ts.isIdentifier(expression) && expression.text === 'require') ||
    (ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.name) &&
      expression.name.text === 'require')
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      const bindings = node.importClause?.namedBindings
      const allTypeOnly =
        !node.importClause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.every((element) => element.isTypeOnly)
      if (!allTypeOnly) push(node.moduleSpecifier)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
      const clause = node.exportClause
      const allTypeOnly =
        clause && ts.isNamedExports(clause) && clause.elements.every((element) => element.isTypeOnly)
      if (!allTypeOnly) push(node.moduleSpecifier)
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
      push(node.moduleReference.expression)
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequireTarget(node.expression)) {
        push(node.arguments[0])
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return specifiers
}

// Development artifacts ship on no runtime and own nothing. Each checker had its own list and they
// disagreed — one knew `__mocks__`, the other did not; neither knew `*.mock.ts` or a module-local
// `test/` directory — so a mock could supply a shared file's second owner or a neutral surface's
// browser side. Overridable per project, because these are conventions, not architecture.
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
