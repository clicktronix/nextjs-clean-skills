import { createHash } from 'node:crypto'
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
    ...(generatedRoot ? [['generatedRoot', generatedRoot]] : []),
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

/**
 * The source file a resolved import path actually names. A specifier carries the extension the
 * *bundler* wants — `./model.js` for a file on disk called `model.ts` under NodeNext, or none at
 * all — so a reader that opens the resolved path verbatim opens nothing and silently reports the
 * file as unreadable.
 */
export function existingSourceFile(target) {
  const candidates = [target]
  for (const extension of SOURCE_EXTENSIONS) {
    candidates.push(`${target}.${extension}`, path.join(target, `index.${extension}`))
  }
  const compiled = target.match(/\.([cm]?)js(x?)$/)
  if (compiled) {
    for (const extension of [`${compiled[1]}ts${compiled[2]}`, 'ts', 'tsx']) {
      candidates.push(target.replace(/\.[cm]?jsx?$/, `.${extension}`))
    }
  }
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate
    } catch {
      // Not a file. The next candidate, or null: resolution failure is import/no-unresolved's report.
    }
  }
  return null
}

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

// Development artifacts do not participate in the production capability graph. These fixed forms
// are deliberately narrow: making them configurable can silently remove production files from the
// graph when a pattern is misspelled or contains regular-expression syntax.
const DEV_SUFFIXES = ['test', 'spec', 'stories', 'mock', 'mocks', 'fixture', 'fixtures']
const DEV_DIRECTORIES = ['__tests__', '__mocks__', '__fixtures__', 'test', 'tests', 'mocks', 'fixtures']

const DEV_FILE = new RegExp(`\\.(${DEV_SUFFIXES.join('|')})\\.(${SOURCE_EXTENSIONS.join('|')})$`)

export function isDevelopmentArtifactFile(file) {
  return DEV_FILE.test(path.basename(file))
}

export function isDevelopmentArtifactDirectory(name) {
  return DEV_DIRECTORIES.includes(name)
}

/**
 * What a contract surface publishes, per exported name.
 *
 * A contract surface exists to publish a capability's vocabulary — its types and the schemas that
 * witness them — so a neighbour's pure policy can speak about the capability without depending on
 * how it works. The promise is only worth enforcing if it is checked structurally: a name test
 * (`/Schema$/`) admits `export function chargeCardSchema() { return fetch(...) }`, which is
 * behaviour wearing a schema's name. So the declaration is read:
 *
 *   - `type` — a type alias, an interface, or a type-only binding. Erased at runtime.
 *   - `schema` — `export const X = <call>` whose callee root is a binding imported from a package
 *     the contract classifies as pure (`purePackages`), or another schema declared in the file.
 *   - `behaviour` — everything else, including every declaration this reader cannot follow. The
 *     classification fails closed: an unreadable file, an unresolvable re-export, a value built by
 *     an unclassified call are all behaviour.
 *
 * `complete` is false when the file re-exports from somewhere this reader could not follow, so a
 * namespace or default binding over it cannot be cleared.
 */
const CONTRACT_EXPORT_CACHE = new Map()
const CONTRACT_EXPORT_DEPTH = 4

const hasExportModifier = (node) =>
  Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))

const hasDefaultModifier = (node) =>
  Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))

function calleeRoot(expression) {
  let current = expression
  while (current) {
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = current.expression
    } else if (ts.isCallExpression(current) || ts.isNonNullExpression(current)) {
      current = current.expression
    } else break
  }
  return current && ts.isIdentifier(current) ? current.text : null
}

function isPureSpecifier(specifier, purePackages) {
  return purePackages.some((name) => specifier === name || specifier.startsWith(`${name}/`))
}

function isSchemaExpression(expression, schemaNames, pureCallees = new Set()) {
  if (!expression) return false
  // A bare identifier is a schema only when it names one; a bare constructor is behaviour.
  if (ts.isIdentifier(expression)) return schemaNames.has(expression.text)
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return isSchemaExpression(expression.expression, schemaNames, pureCallees)
  }
  if (ts.isCallExpression(expression)) {
    const root = calleeRoot(expression.expression)
    return root !== null && (schemaNames.has(root) || pureCallees.has(root))
  }
  return false
}

function readSourceFile(file) {
  try {
    // Keyed by content, not mtime: a rewrite inside one timestamp tick, or a copy that preserves
    // mtime, would otherwise serve the previous classification for the rest of the process.
    const text = fs.readFileSync(file, 'utf8')
    const digest = createHash('sha256').update(text).digest('hex')
    const cached = CONTRACT_EXPORT_CACHE.get(file)
    if (cached && cached.digest === digest) return cached
    const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const entry = { digest, parsed, result: null }
    CONTRACT_EXPORT_CACHE.set(file, entry)
    return entry
  } catch {
    return null
  }
}

export function contractSurfaceExports(file, options = {}) {
  const { paths = null, purePackages = [], depth = CONTRACT_EXPORT_DEPTH, seen = new Set() } = options
  const entry = readSourceFile(file)
  if (!entry) return null
  if (entry.result && depth === CONTRACT_EXPORT_DEPTH && seen.size === 0) return entry.result
  if (seen.has(file) || depth <= 0) return { kinds: new Map(), complete: false }
  const nested = new Set(seen).add(file)
  const parsed = entry.parsed

  // Every local declaration, not only the exported ones: `export { X }` names a local binding.
  const locals = new Map()
  const schemaNames = new Set()
  const pureCallees = new Set()
  const deferred = []

  const follow = (specifierNode) => {
    const specifier = specifierNode && ts.isStringLiteralLike(specifierNode) ? specifierNode.text : null
    if (specifier === null || paths === null) return null
    const target = resolveProjectImport(paths, file, specifier)
    const candidate = target === null ? null : existingSourceFile(target)
    if (candidate === null) return null
    return contractSurfaceExports(candidate, {
      paths,
      purePackages,
      depth: depth - 1,
      seen: nested,
    })
  }

  for (const statement of parsed.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      const clause = statement.importClause
      if (!clause) continue
      const pure = isPureSpecifier(statement.moduleSpecifier.text, purePackages)
      const record = (name, isTypeOnly) => {
        if (clause.isTypeOnly || isTypeOnly) locals.set(name, 'type')
        else if (pure) {
          // A binding imported from a schema package is a constructor — `string`, `object` — and
          // exporting it bare exports behaviour. Only a call rooted in it yields a schema.
          locals.set(name, 'behaviour')
          pureCallees.add(name)
        } else deferred.push({ name, statement })
      }
      if (clause.name) record(clause.name.text, false)
      const bindings = clause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) record(bindings.name.text, false)
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) record(element.name.text, element.isTypeOnly)
      }
      continue
    }
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      locals.set(statement.name.text, 'type')
      continue
    }
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) locals.set(statement.name.text, 'behaviour')
      continue
    }
    if (ts.isEnumDeclaration(statement)) {
      locals.set(statement.name.text, 'behaviour')
      continue
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        locals.set(declaration.name.text, 'behaviour')
      }
    }
  }

  // Imported bindings are classified first, so a schema imported from a sibling file can seed a
  // derived declaration below; resolving them after the fixed point left every such derivation
  // classified as behaviour.
  for (const { name, statement } of deferred) {
    const resolved = follow(statement.moduleSpecifier, name)
    const imported = resolved?.kinds.get(name)
    locals.set(name, imported ?? 'behaviour')
    if (imported === 'schema') schemaNames.add(name)
  }

  // A schema may be built from a schema declared later in the file, so classification is a fixed
  // point rather than one pass in declaration order.
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false
    for (const statement of parsed.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        const name = declaration.name.text
        if (schemaNames.has(name)) continue
        if (!isSchemaExpression(declaration.initializer, schemaNames, pureCallees)) continue
        schemaNames.add(name)
        locals.set(name, 'schema')
        changed = true
      }
    }
    if (!changed) break
  }

  const kinds = new Map()
  let complete = true

  for (const statement of parsed.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      hasExportModifier(statement)
    ) {
      kinds.set(hasDefaultModifier(statement) ? 'default' : statement.name?.text ?? 'default', 'behaviour')
      continue
    }
    if (
      (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
      hasExportModifier(statement)
    ) {
      kinds.set(statement.name.text, 'type')
      continue
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          complete = false
          continue
        }
        kinds.set(declaration.name.text, locals.get(declaration.name.text) ?? 'behaviour')
      }
      continue
    }
    if (ts.isExportAssignment(statement)) {
      kinds.set('default', 'behaviour')
      continue
    }
    if (!ts.isExportDeclaration(statement)) continue
    const clause = statement.exportClause
    if (!clause) {
      const resolved = statement.moduleSpecifier ? follow(statement.moduleSpecifier) : null
      if (!resolved) {
        complete = false
        continue
      }
      if (!resolved.complete) complete = false
      for (const [name, kind] of resolved.kinds) if (!kinds.has(name)) kinds.set(name, kind)
      continue
    }
    if (ts.isNamespaceExport(clause)) {
      kinds.set(clause.name.text, statement.isTypeOnly ? 'type' : 'behaviour')
      continue
    }
    const resolved = statement.moduleSpecifier ? follow(statement.moduleSpecifier) : null
    if (statement.moduleSpecifier && !resolved) complete = false
    for (const element of clause.elements) {
      const source = (element.propertyName ?? element.name).text
      if (statement.isTypeOnly || element.isTypeOnly) {
        kinds.set(element.name.text, 'type')
        continue
      }
      const kind = statement.moduleSpecifier
        ? resolved?.kinds.get(source) ?? 'behaviour'
        : locals.get(source) ?? 'behaviour'
      kinds.set(element.name.text, kind)
    }
  }

  const result = { kinds, complete }
  if (depth === CONTRACT_EXPORT_DEPTH && seen.size === 0) entry.result = result
  return result
}
