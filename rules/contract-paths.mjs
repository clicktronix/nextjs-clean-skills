import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

export function sourceFilesPattern(paths) {
  const relative = posix(path.relative(paths.projectRoot, paths.sourceRoot))
  return `${relative ? `${relative}/` : ''}**/*.{js,jsx,ts,tsx}`
}

export { posix }
