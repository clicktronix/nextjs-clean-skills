// Contract validation with no dependency beyond Node, so the installer can run the loader's own
// test before it writes a file and the two can never disagree about what a valid contract is.
import path from 'node:path'

// The lists every rule reads: the vocabulary of segments and surfaces, and the package
// classifications. A missing classification would leave its rule with nothing to match and a clean
// result; a malformed vocabulary would stop the rule from loading at all.
export const REQUIRED_LISTS = [
  'segments',
  'publicSurfaces',
  'serverSurfaces',
  'serverExecutionSurfaces',
  'clientSurfaces',
  'sharedRoots',
  'purePackages',
  'runtimePackages',
  'providerPackages',
  'serverPackages',
  'channelSurfaces',
]
const OPTIONAL_LISTS = ['neutralSurfaces', 'contractSurfaces']

const isStringList = (values) => Array.isArray(values) && values.every((value) => typeof value === 'string')

export function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`))
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

/** The contract's roots and aliases as absolute paths, or the first reason it is not valid. */
export function resolveContract(projectRoot, contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('the contract must be a JSON object')
  }
  for (const name of REQUIRED_LISTS) {
    if (!isStringList(contract[name])) throw new Error(`${name} must be an array of strings`)
  }
  for (const name of OPTIONAL_LISTS) {
    if (contract[name] !== undefined && !isStringList(contract[name])) {
      throw new Error(`${name} must be an array of strings`)
    }
  }
  const sourceRoot = projectPath(projectRoot, 'sourceRoot', contract.sourceRoot)
  const moduleRoot = projectPath(projectRoot, 'moduleRoot', contract.moduleRoot)
  const appRoot = projectPath(projectRoot, 'appRoot', contract.appRoot)
  const sharedRoot = projectPath(projectRoot, 'sharedRoot', contract.sharedRoot)
  const generatedRoot = contract.generatedRoot
    ? projectPath(projectRoot, 'generatedRoot', contract.generatedRoot)
    : null

  const ownedRoots = [
    ['moduleRoot', moduleRoot],
    ['appRoot', appRoot],
    ['sharedRoot', sharedRoot],
    ...(generatedRoot ? [['generatedRoot', generatedRoot]] : []),
  ]
  for (const [name, root] of ownedRoots) {
    if (!isWithin(sourceRoot, root)) throw new Error(`${name} must stay inside sourceRoot`)
  }
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
    sourceRoot,
    moduleRoot,
    appRoot,
    sharedRoot,
    generatedRoot,
    importAliases: aliases(projectRoot, contract.importAliases),
  }
}

export function contractProblems(projectRoot, contract) {
  // An older contract usually lacks several lists at once, so those are named together; the
  // loader itself stops at the first.
  if (contract && typeof contract === 'object' && !Array.isArray(contract)) {
    const lists = [
      ...REQUIRED_LISTS.filter((name) => !isStringList(contract[name])),
      ...OPTIONAL_LISTS.filter((name) => contract[name] !== undefined && !isStringList(contract[name])),
    ]
    if (lists.length > 0) return lists.map((name) => `${name} must be an array of strings`)
  }
  try {
    resolveContract(projectRoot, contract)
    return []
  } catch (error) {
    return [error.message]
  }
}

// A package's identity is its name, and a scoped name is two segments.
function packageRoot(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

// The contract may classify a scope (`@supabase`), a package (`@scope/pkg`) or an exact specifier;
// a subpath inherits the class of the package and of the scope above it. The lint rule and the
// dependency check both match through this, so they cannot disagree about what a list covers.
export function packageIdentities(specifier) {
  const bare = specifier.replace(/^node:/, '')
  const identities = [specifier, bare, packageRoot(bare)]
  if (bare.startsWith('@')) identities.push(bare.split('/')[0])
  return identities
}

export const isClassified = (specifier, classified) =>
  packageIdentities(specifier).some((identity) => classified.has(identity))

/** Two contract entries that name the same package, one possibly through the other's scope or root. */
export const sameFamily = (left, right) =>
  packageIdentities(left).includes(right) || packageIdentities(right).includes(left)
