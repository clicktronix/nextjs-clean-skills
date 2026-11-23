import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

import { isWithin, resolveContract } from './contract-keys.mjs'

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

const CONTRACT = path.join('rules', 'architecture-contract.json')

// The rules are installed in the project's `rules/` directory, so the project is the nearest
// package.json above the file that asks (`metaUrl`), or `rootOverride` names it directly. The
// contract has one location in both.
export function loadArchitecturePaths(metaUrl, rootOverride) {
  const projectRoot = rootOverride
    ? path.resolve(rootOverride)
    : findProjectRoot(path.dirname(fileURLToPath(metaUrl)))
  const contractPath = path.join(projectRoot, CONTRACT)
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Cannot find ${CONTRACT} in ${projectRoot}`)
  }
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
  let roots
  try {
    roots = resolveContract(projectRoot, contract)
  } catch (error) {
    throw new Error(`${error.message} in ${path.relative(projectRoot, contractPath)}`)
  }

  // Every entry the contract classifies a package by; an entry below a package names an entry point.
  const classifiedEntries = ['purePackages', 'runtimePackages', 'providerPackages', 'serverPackages'].flatMap(
    (list) => contract[list]
  )
  return { contract, projectRoot, classifiedEntries, ...roots, ...typescriptResolution(projectRoot) }
}

// The project's own compiler options. Imports are resolved the way its TypeScript resolves them,
// so a `paths` mapping the contract never declared, a bare specifier found through `baseUrl` and
// a directory whose package.json names its entry all lead to the file that is actually loaded.
function typescriptResolution(projectRoot) {
  const file = path.join(projectRoot, 'tsconfig.json')
  if (!fs.existsSync(file)) {
    return withImplementation({ moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true })
  }
  const { config, error } = ts.readConfigFile(file, ts.sys.readFile)
  if (error) throw new Error(`Cannot read tsconfig.json: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`)
  // `extends` is followed; the source files the config includes are not enumerated.
  const { options } = ts.parseJsonConfigFileContent(config, { ...ts.sys, readDirectory: () => [] }, projectRoot)
  return withImplementation(options)
}

function withImplementation(compilerOptions) {
  // The same resolution without declaration files: what the runtime loads for a value edge.
  const implementation = (options) => ({ ...options, noDtsResolution: true, allowJs: true })
  const { paths: _paths, baseUrl: _baseUrl, ...packageOptions } = compilerOptions
  return {
    compilerOptions,
    implementationOptions: implementation(compilerOptions),
    // Package resolution alone, without the project's own mappings: what a package exports
    // under a name, which a `paths` entry for that spelling does not change.
    packageResolution: { compilerOptions: packageOptions, implementationOptions: implementation(packageOptions) },
    verbatimModuleSyntax: compilerOptions.verbatimModuleSyntax === true,
    // The two conditions a package mapping can distinguish. Every edge is resolved under both,
    // whatever the configured strategy: where they agree there is one answer, as almost always.
    resolutionModes: [ts.ModuleKind.ESNext, ts.ModuleKind.CommonJS],
  }
}

export { isWithin }

export function relativeParts(root, candidate) {
  if (!isWithin(root, candidate)) return null
  const relative = posix(path.relative(root, candidate))
  return relative ? relative.split('/') : []
}

const IN_NODE_MODULES = /[\\/]node_modules[\\/]/

// A manifest as TypeScript reads it: a byte-order mark an editor left does not stop it.
const readManifest = (file, host = ts.sys) => ts.readConfigFile(file, host.readFile).config ?? {}

// A host that reads manifests through `rewrite`. Only a manifest that can hold the key is
// parsed: one that spells it out, or one that escapes characters and so may spell it otherwise.
function manifestHost(host, key, rewrite) {
  return {
    ...host,
    readFile: (file) => {
      const content = host.readFile(file)
      if (path.basename(file) !== 'package.json' || !(content?.includes(key) || content?.includes('\\u'))) return content
      const manifest = readManifest(file, host)
      return manifest[key] === undefined ? content : JSON.stringify(rewrite(manifest, file))
    },
  }
}

// What a runtime reads of a manifest. `typesVersions` redirects declarations and nothing else,
// yet TypeScript follows it for any lookup, so a value edge is resolved without it.
const runtimeHost = (host) =>
  manifestHost(host, 'typesVersions', ({ typesVersions: _declarationsOnly, ...manifest }) => manifest)

const RUNTIME_SYS = runtimeHost(ts.sys)

// The hosts of an ordinary edge: declarations through the real filesystem, values through the
// runtime's reading of it.
const PROJECT_HOSTS = { types: ts.sys, runtime: RUNTIME_SYS }

// The names of a marker file: a file a host pretends exists so that TypeScript's own choice
// shows in where a resolution lands. `existing` are the names it must exist under, one for each
// of the project's `moduleSuffixes` (no list and an empty list both leave the plain name alone).
// `known` adds the plain name, which TypeScript reports for a target it found through a suffix.
// A TypeScript file is one both passes load, with or without declaration lookup.
function markerNames(stem, configured) {
  const suffixes = configured?.length ? configured : ['']
  return {
    existing: suffixes.map((suffix) => `${stem}${suffix}.ts`),
    known: ['', ...suffixes].map((suffix) => `${stem}${suffix}.ts`),
  }
}

// A `#` alias may stand for a Node builtin (`"#fs": "fs/promises"`). Node loads the builtin;
// TypeScript looks for a file, finds none or finds a package installed under the builtin's
// name, and cannot say which branch of the alias it took. So the alias is resolved through a
// host in which every builtin target of an `imports` map is a file of its own: the target is
// rewritten to a marker beside the manifest, and the host reports exactly those markers as
// existing. TypeScript then selects the branch — conditions, patterns, `null` — and `builtin`
// tells which builtin a resolution landed on. A marker is known by its whole path. It exists
// under every name the project's `moduleSuffixes` make TypeScript try, and is recognised under
// those and under the plain name, which is the one TypeScript reports for a target it found
// through a suffix. It is allocated where no real file is, so a real file is never taken for one.
// The value pass and the declaration pass read through hosts of their own and share one
// allocation, so a marker path stands for one builtin whichever pass produced it.
function aliasHosts(specifier, suffixes) {
  const markers = new Map()
  const existing = new Set()
  let allocated = 0
  const directories = new Set()
  const slashes = (file) => file.replaceAll('\\', '/')
  // The part of the specifier a pattern key's `*` stands for, or null when the key does not match.
  const starOf = (key) => {
    const [prefix, suffix] = key.split('*')
    return suffix !== undefined &&
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix)
      ? specifier.slice(prefix.length, specifier.length - suffix.length)
      : null
  }
  const rewrite = (manifest, file) => {
    if (!manifest.imports || typeof manifest.imports !== 'object') return manifest
    const directory = `${slashes(path.dirname(file))}/.node-builtin`
    const mark = (target, star) => {
      if (typeof target === 'string') {
        const named = star === null ? target : target.split('*').join(star)
        if (!isBuiltin(named)) return target
        const names = () => markerNames(`${directory}/${allocated}`, suffixes)
        while (names().known.some((name) => ts.sys.fileExists(name))) allocated += 1
        for (const name of names().known) markers.set(name, named)
        for (const name of names().existing) existing.add(name)
        directories.add(directory)
        allocated += 1
        return `./.node-builtin/${allocated - 1}.ts`
      }
      if (Array.isArray(target)) return target.map((item) => mark(item, star))
      if (target && typeof target === 'object') {
        return Object.fromEntries(Object.entries(target).map(([condition, value]) => [condition, mark(value, star)]))
      }
      return target
    }
    return {
      ...manifest,
      imports: Object.fromEntries(Object.entries(manifest.imports).map(([key, target]) => [key, mark(target, starOf(key))])),
    }
  }
  const over = (host) => ({
    ...manifestHost(host, 'imports', rewrite),
    fileExists: (file) => existing.has(slashes(file)) || host.fileExists(file),
    directoryExists: (directory) => directories.has(slashes(directory)) || host.directoryExists(directory),
  })
  return {
    builtin: (file) => markers.get(slashes(file)) ?? null,
    hosts: { types: over(ts.sys), runtime: over(RUNTIME_SYS) },
  }
}

const prefixed = (builtin) => `node:${builtin.replace(/^node:/, '')}`

// Where a resolution found its file below node_modules, if it did. TypeScript reports the real
// path and, when a link led there, the path as found; either can be the one inside node_modules.
function installedPath(resolved) {
  return [resolved.originalPath, resolved.resolvedFileName].find((file) => file && IN_NODE_MODULES.test(file))
}

// The package a file below node_modules belongs to: the name it is installed under, which is
// its directory, that directory, and the directory whose node_modules holds it.
function installedPackage(found) {
  const inside = found.split(IN_NODE_MODULES).at(-1)
  const parts = inside.split(/[\\/]/)
  const installed = parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/')
  const holder = found.slice(0, found.length - inside.length)
  return { installed, directory: holder + installed, beside: path.dirname(holder) }
}

// Where and how one copy of a package is asked what it gives for an entry. The importer stands
// in the directory whose node_modules holds the copy, so package lookup finds that copy before
// any other, and never looks inside it for one it holds under the same name. The filesystem is
// the real one, so whatever the entry reaches outside the package's own directory is there as
// in a real installation. Only the manifests at and above the importer are read as empty: its
// package scope then has no name and no export map, so the package that holds the copy cannot
// answer for a name it happens to share. They stay files, since an entry may point at one.
function besideHolder(beside) {
  const scope = (file) => path.basename(file) === 'package.json' && isWithin(path.dirname(file), beside)
  return {
    importer: path.join(beside, '__importer__.ts'),
    hosts: {
      types: { ...ts.sys, readFile: (file) => (scope(file) ? '{}' : ts.sys.readFile(file)) },
      runtime: { ...RUNTIME_SYS, readFile: (file) => (scope(file) ? '{}' : RUNTIME_SYS.readFile(file)) },
    },
  }
}

// What makes two resolved paths one file. TypeScript follows links unless the project preserves
// them, and then each link is a module of its own; where the filesystem does not tell case
// apart TypeScript keeps the spelling it was asked with. A file that vanished after it was
// resolved is its own path.
function fileIdentity({ preserveSymlinks }) {
  if (preserveSymlinks) return (file) => (ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase())
  return (file) => {
    try {
      return fs.realpathSync.native(file)
    } catch {
      return file
    }
  }
}

// A DefinitelyTyped package stands for the package it types, so a type import served by
// `@types/pg` is still `pg`.
function typedPackage(name) {
  if (!name.startsWith('@types/')) return name
  const typed = name.slice('@types/'.length)
  return typed.includes('__') ? `@${typed.replace('__', '/')}` : typed
}

// One thing an edge loads from node_modules. What was loaded is identified by the resolution,
// never by how the import spells it, and the target keeps two sets of names apart.
//
// `names` say what it is: the name the package's own manifest gives (the one TypeScript reports
// or, where it reports none, the one the manifest holds) and every contract entry under which
// this copy of the package exports the loaded file. So `next/headers` is matched by
// `next/headers.js`, by an alias, by a `paths` mapping and by a link alike, and an entry the
// contract does not name stays the bare package.
//
// `aliases` say what this project calls it: the name it is installed under when that differs
// (`"db": "npm:pg@8"` is `pg`, as `db`), read from the path the package was found at, which for a
// linked package is the link, and the contract entries spelled with that name. An alias can
// restrict an edge; only a name can permit one.
//
// `exportsFile` says whether this copy of the package gives the loaded file for an entry; see
// besideHolder for how the question is kept to this copy. A relative or absolute path into
// node_modules is marked, and the rule refuses it.
function packageTarget(paths, specifier, resolved, exportsFile) {
  const found = installedPath(resolved)
  const { installed, directory, beside } = found ? installedPackage(found) : {}
  const manifest = directory && path.join(directory, 'package.json')
  const own = (manifest && fs.existsSync(manifest) ? readManifest(manifest).name : undefined) ?? resolved.packageId?.name
  const alias = installed && typedPackage(installed)
  const identity = own ? typedPackage(own) : (alias ?? specifier)
  const names = new Set([identity])
  const aliases = new Set(alias && alias !== identity ? [alias] : [])
  for (const entry of directory ? paths.classifiedEntries : []) {
    for (const [name, named] of [[identity, names], ...[...aliases].map((spelling) => [spelling, aliases])]) {
      if (entry.startsWith(`${name}/`) && exportsFile(beside, alias + entry.slice(name.length))) {
        named.add(entry)
      }
    }
  }
  const byPath = specifier.startsWith('.') || path.isAbsolute(specifier)
  return { package: specifier, names, aliases, ...(byPath ? { byPath: true } : {}) }
}

// What an edge loads: a project file, a package, or an ambiguity. Which file a runtime picks can
// depend on how the edge is written, on the importing file's format and on an explicit resolution
// mode, because a package `imports` or `exports` mapping may name one file for `require` and
// another for `import`, and a directory's manifest one file for a client build and another for
// a server build. The rules do not guess and do not model those choices: every edge is resolved
// every way, and a specifier that reaches different project files is returned as ambiguous for
// the rule to refuse. A value edge loads an implementation, so it is resolved
// without declaration files, which only a type edge reads; the declaration answers for a value
// edge only when nothing else exists, as with an ambient module.
export function resolveEdgeTargets(paths, importer, specifier, { typeOnly = false } = {}) {
  let memo = answers.get(paths)
  if (!memo || Date.now() - memo.born >= ANSWER_LIFETIME) {
    memo = { born: Date.now(), targets: new Map(), entries: new Map() }
    answers.set(paths, memo)
  }
  const key = `${path.dirname(importer)}\0${specifier}\0${typeOnly}`
  if (!memo.targets.has(key)) memo.targets.set(key, edgeTargets(paths, importer, specifier, typeOnly, memo.entries))
  return memo.targets.get(key)
}

// An edge's targets depend on the directory it is written in, not on the file: a lint run asks
// the same question from the same directory many times over. Answers are kept for exactly that
// question — TypeScript's own cache shares an answer with every directory below, which is wrong
// where a package scope begins — and dropped after half a minute, as eslint-plugin-import drops
// its own, so a long-lived process still notices a file that appeared.
const ANSWER_LIFETIME = 30_000
const answers = new WeakMap()

function edgeTargets(paths, importer, specifier, typeOnly, entries) {
  // Node loads the builtin for a builtin's name whatever is installed under that name, and it is
  // one module with or without its prefix: it answers to the prefixed name.
  if (isBuiltin(specifier)) return [{ package: specifier, names: new Set([specifier, prefixed(specifier)]) }]
  const targets = new Map()
  const resolve = (mode, request, from, { implementationOptions, compilerOptions } = paths, hosts = PROJECT_HOSTS) => {
    const resolveWith = (options, host) =>
      ts.resolveModuleName(request, from, options, host, undefined, undefined, mode).resolvedModule
    return (
      (typeOnly ? undefined : resolveWith(implementationOptions, hosts.runtime)) ??
      resolveWith(compilerOptions, hosts.types)
    )
  }
  const identity = fileIdentity(paths.compilerOptions)
  const alias = specifier.startsWith('#') ? aliasHosts(specifier, paths.compilerOptions.moduleSuffixes) : null
  const manifests = new Set()
  const hosts = watched(alias?.hosts ?? PROJECT_HOSTS, manifests)
  for (const mode of paths.resolutionModes) {
    const resolved = resolve(mode, specifier, importer, paths, hosts)
    if (!resolved) continue
    const builtin = alias?.builtin(resolved.resolvedFileName)
    if (builtin) {
      const names = [specifier, prefixed(builtin)]
      targets.set(`builtin:${names.join('+')}`, { package: specifier, names: new Set(names) })
      continue
    }
    if (resolved.isExternalLibraryImport || installedPath(resolved)) {
      // An entry names every file it gives under either mode.
      const loaded = identity(resolved.resolvedFileName)
      const target = packageTarget(paths, specifier, resolved, (beside, entry) => {
        const { importer: asker, hosts } = besideHolder(beside)
        return paths.resolutionModes.some((any) => {
          const answer = resolve(any, entry, asker, paths.packageResolution, hosts)?.resolvedFileName
          return Boolean(answer) && identity(answer) === loaded
        })
      })
      targets.set(`package:${[...target.names].sort().join('+')}:${[...target.aliases].sort().join('+')}`, target)
    } else {
      targets.set(identity(resolved.resolvedFileName), { file: resolved.resolvedFileName })
    }
  }
  // A request that enters a directory of the project also loads whatever that directory's
  // manifest gives a bundler; entries that differ from each other or from TypeScript's are
  // different answers, and so ambiguous. Of the project manifests the resolution read, the ones
  // with bundler entries are tried: see `entering` for how a directory is known to be entered.
  // What TypeScript took from such a directory for want of a runtime file — a declaration — is
  // not a second runtime answer beside the bundler's, and is dropped. A type edge reads
  // declarations, which no bundler field names.
  for (const directory of typeOnly ? [] : manifests) {
    if (IN_NODE_MODULES.test(`${directory}/`) || bundlerEntries(directory, entries).length === 0) continue
    const { isMarker, hosts: through } = entering(
      alias?.hosts ?? PROJECT_HOSTS,
      directory,
      paths.compilerOptions.moduleSuffixes
    )
    const entered = paths.resolutionModes.some((mode) => {
      const answer = resolve(mode, specifier, importer, paths, through)?.resolvedFileName
      return Boolean(answer) && isMarker(answer)
    })
    if (!entered) continue
    for (const [key, target] of targets) {
      if (target.file && /\.d\.[cm]?ts$/.test(target.file)) targets.delete(key)
    }
    for (const entry of bundlerEntries(directory, entries)) {
      if (!targets.has(identity(entry))) targets.set(identity(entry), { file: entry })
    }
  }
  const files = [...targets.values()].flatMap((target) => (target.file ? [target.file] : []))
  if (files.length > 0 && targets.size > 1) return [{ ambiguous: files }]
  if (targets.size > 0) return [...targets.values()]
  // TypeScript found nothing: an asset, a file that does not exist yet, a package that is not
  // installed, or an alias only the contract declares. Those are placed by their spelling.
  const explicit =
    specifier.startsWith('.') || path.isAbsolute(specifier) ? path.resolve(path.dirname(importer), specifier) : null
  if (explicit && IN_NODE_MODULES.test(explicit)) {
    return [packageTarget(paths, specifier, { resolvedFileName: explicit }, () => false)]
  }
  // A specifier ending in `/`, `.` or `..` names a directory, never a file beside it; the resolved
  // path keeps a trailing separator so that intent survives path.resolve.
  const directory = /(^|\/)\.{0,2}$/.test(specifier) ? path.sep : ''
  if (specifier.startsWith('.')) return [{ file: explicit + directory }]
  const declared = paths.importAliases.find(([prefix]) => specifier.startsWith(prefix))
  // The remainder cannot begin with a separator, and so cannot make path.resolve discard
  // the alias target: prefixes are required to end with one (see aliases()).
  return [
    declared
      ? { file: path.resolve(declared[1], specifier.slice(declared[0].length)) + directory }
      : { package: specifier, names: new Set([specifier]) },
  ]
}

// The directive prologue of a file: the string-literal statements it opens with, and nothing
// after the first statement of another kind.
export function fileDirectives(file) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return []
  const parsed = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false)
  const directives = []
  for (const statement of parsed.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break
    directives.push(statement.expression.text)
  }
  return directives
}

// Every extension a project source file can carry. ESLint and cycle detection share this inventory.
export const SOURCE_EXTENSIONS = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']

export function sourceFilesPattern(paths) {
  const relative = posix(path.relative(paths.projectRoot, paths.sourceRoot))
  return `${relative ? `${relative}/` : ''}**/*.{${SOURCE_EXTENSIONS.join(',')}}`
}

export { posix }

/**
 * The file a path without a query names, the way a bundler finds it: the path itself, the path
 * with a source extension added or in place of its own, or a directory's index. A path ending in
 * a separator names a directory only. Null when no file is there.
 */
export function sourceFileAt(absolute) {
  const stripped = absolute.replace(/\.[cm]?[jt]sx?$/, '')
  const index = SOURCE_EXTENSIONS.map((extension) => path.join(absolute, `index.${extension}`))
  const candidates = absolute.endsWith(path.sep)
    ? index
    : [
        absolute,
        ...SOURCE_EXTENSIONS.map((extension) => `${absolute}.${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => `${stripped}.${extension}`),
        ...index,
      ]
  return candidates.find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) ?? null
}

/**
 * The module a bundler loads for `new URL(reference, import.meta.url)`, as a specifier relative
 * to the importing file, or null when the reference names no module of the project. A reference
 * without a leading dot is still relative to the importing module, and a query or fragment is
 * not part of the file name. A path from the root is looked up in the project, as Next.js
 * configures its bundler to do: when something is there — a file, a file under another source
 * extension, a directory — it is the relative specifier that names the same place, trailing
 * slash included, and goes through resolution like any import; when nothing is there it is a
 * public URL. An absolute URL is never an edge. `paths` is what loadArchitecturePaths returned;
 * a reader without it cannot place a rooted path.
 */
export function urlSpecifier(reference, importer, paths) {
  const file = reference.split(/[?#]/)[0]
  if (file === '' || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) return null
  if (!file.startsWith('/')) return file.startsWith('.') ? file : `./${file}`
  if (!paths?.projectRoot) return null
  const rooted = path.join(paths.projectRoot, file)
  if (!fs.existsSync(rooted) && !sourceFileAt(rooted)) return null
  const relative = posix(path.relative(path.dirname(importer), rooted))
  return `${relative.startsWith('.') ? relative : `./${relative}`}${file.endsWith('/') ? '/' : ''}`
}

// A pair of hosts that note the directory of every manifest a resolution reads, spelled as
// TypeScript spells it. Each host delegates to the one it watches; this runs for every edge.
function watched(hosts, manifests) {
  const watch = (host) => {
    const watching = Object.create(host)
    watching.readFile = (file) => {
      if (file.endsWith('/package.json')) manifests.add(file.slice(0, -'/package.json'.length))
      return host.readFile(file)
    }
    return watching
  }
  return { types: watch(hosts.types), runtime: watch(hosts.runtime) }
}

// A pair of hosts in which one directory's manifest says only that its entry is a marker file,
// which exists there and nowhere else. A resolution that enters the directory as a package
// comes out at the marker; one that merely reads the manifest on its way, as a package scope
// of the importing file, does not. TypeScript does the entering, so the answer holds for any
// spelling of the request.
function entering(hosts, directory, suffixes) {
  const marker = markerNames(`${directory}/__entered__`, suffixes)
  const enter = (host) => {
    const through = Object.create(host)
    through.readFile = (file) =>
      file === `${directory}/package.json` ? '{"main":"./__entered__.ts"}' : host.readFile(file)
    through.fileExists = (file) => marker.existing.includes(file) || host.fileExists(file)
    return through
  }
  return { isMarker: (file) => marker.known.includes(file), hosts: { types: enter(hosts.types), runtime: enter(hosts.runtime) } }
}

// The entries of a directory that a bundler may take and TypeScript does not read: the files
// its manifest names in `browser` and `module`. Which field wins depends on the build — a
// client build and a server build order them differently — so each is a possible answer.
// `main` and `types` TypeScript reads itself.
function bundlerEntries(directory, remembered) {
  if (remembered.has(directory)) return remembered.get(directory)
  const manifest = path.join(directory, 'package.json')
  const declared = fs.statSync(manifest, { throwIfNoEntry: false })?.isFile() ? readManifest(manifest) : {}
  const entries = ['browser', 'module'].flatMap((field) => {
    const entry = typeof declared[field] === 'string' ? sourceFileAt(path.join(directory, declared[field])) : null
    return entry ? [entry] : []
  })
  remembered.set(directory, entries)
  return entries
}

/**
 * Every static module-loading form, with its kind. Callers decide whether type-only edges matter;
 * cycle detection keeps them because the contract requires an acyclic module graph.
 */
export function moduleEdges(parsed, paths = {}) {
  const { verbatimModuleSyntax = false, importer = parsed.fileName } = paths
  const edges = []
  // Parentheses and assertions are erased by the compiler, so a name is read through them.
  const bare = (node) => node && ts.skipOuterExpressions(node)
  const literal = (node) => (bare(node) && ts.isStringLiteralLike(bare(node)) ? bare(node).text : null)
  const push = (node, typeOnly) => {
    const specifier = literal(node)
    if (specifier !== null) edges.push({ specifier, typeOnly: typeOnly || declaration })
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
  // Under `verbatimModuleSyntax` the compiler keeps `import { type X } from './x'` as
  // `import {} from './x'`, so only a declaration-level `import type` erases the edge.
  const allTypeOnly = (elements) =>
    !verbatimModuleSyntax && elements.length > 0 && elements.every((element) => element.isTypeOnly)
  // A declaration file is erased whole: whatever an edge in it is written as, it loads nothing.
  const declaration = parsed.isDeclarationFile
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
    // `import('./x').T` and `typeof import('./x')` in a type position are an ImportTypeNode, not a
    // call. The compiler erases them, but the coupling survives, so they are type-only edges.
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      push(node.argument.literal, true)
    }
    // `new URL('./worker.ts', import.meta.url)` is how a bundler is told to load a file, a worker
    // above all. A computed reference names an asset chosen at run time and is no edge.
    // Only `import.meta` is the importing module; `new.target` is a class.
    if (ts.isNewExpression(node) && ts.isIdentifier(bare(node.expression)) && bare(node.expression).text === 'URL') {
      const [reference, base] = (node.arguments ?? []).map(bare)
      const meta = base && (ts.isPropertyAccessExpression(base) || ts.isElementAccessExpression(base)) ? base : null
      const member = !meta ? null : ts.isPropertyAccessExpression(meta) ? meta.name.text : literal(meta.argumentExpression)
      const owner = meta && bare(meta.expression)
      if (
        member === 'url' &&
        ts.isMetaProperty(owner) &&
        owner.keywordToken === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 2 &&
        literal(reference) !== null
      ) {
        const specifier = urlSpecifier(literal(reference), importer, paths)
        if (specifier !== null) edges.push({ specifier, typeOnly: declaration })
      }
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
