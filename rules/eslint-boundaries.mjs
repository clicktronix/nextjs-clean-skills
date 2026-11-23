/**
 * Capability ownership and runtime boundaries.
 *
 * Spread the exported array after the base flat ESLint configs. The rule deliberately protects a small architectural floor. Semantic
 * depth, authorization, cache ownership, and report-once behavior require review and runtime tests.
 */

import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import {
  fileDirectives,
  isDevelopmentArtifactDirectory,
  isDevelopmentArtifactFile,
  isWithin,
  loadArchitecturePaths,
  posix,
  relativeParts,
  resolveEdgeTargets,
  sourceFileAt,
  sourceFilesPattern,
  SOURCE_EXTENSIONS,
  urlSpecifier,
} from './contract-paths.mjs'
import { isClassified } from './contract-keys.mjs'

const paths = loadArchitecturePaths(import.meta.url)
const {
  contract,
  projectRoot: PROJECT_ROOT,
  sourceRoot: SOURCE_ROOT,
  moduleRoot: MODULE_ROOT,
  appRoot: APP_ROOT,
  sharedRoot: SHARED_ROOT,
  generatedRoot: GENERATED_ROOT,
} = paths
const SEGMENTS = new Set(contract.segments)
const PUBLIC_SURFACES = new Set(contract.publicSurfaces)
const SERVER_SURFACES = new Set(contract.serverSurfaces)
const SERVER_EXECUTION_SURFACES = new Set(contract.serverExecutionSurfaces)
const CLIENT_SURFACES = new Set(contract.clientSurfaces)
const NEUTRAL_SURFACES = new Set(contract.neutralSurfaces ?? [])
// A contract surface publishes the capability's pure API — types, schemas and pure domain functions.
// A neighbour's `domain/` and `application/` may read it; every other surface of that neighbour stays
// closed to them. Purity is held by direction: as a neutral surface it imports only its own domain,
// `shared/kernel` and pure packages, so it cannot hand a neighbour anything that performs IO.
const CONTRACT_SURFACES = new Set(contract.contractSurfaces ?? [])
// Optional and validated by contract-paths. A repository with no generated provider contracts
// simply does not declare it; absent means "this project has none", not "unchecked".
const isGeneratedFile = absolute => GENERATED_ROOT !== null && isWithin(GENERATED_ROOT, absolute)
const SHARED_ROOTS = new Set(contract.sharedRoots)
const RUNTIME_PACKAGES = new Set(contract.runtimePackages)
const PURE_PACKAGES = new Set(contract.purePackages)
// Store and provider SDKs. Only an adapter names one: a capability's private `server/` or `client/`
// segment, or the shared root of the same runtime.
const PROVIDER_PACKAGES = new Set(contract.providerPackages)
// Entry points only a server can load. `node:` builtins are refused the same way without a list.
const SERVER_PACKAGES = new Set(contract.serverPackages)
// The surfaces that own a request: each resolves identity and reports for it. `server.ts` is the
// one server surface that does neither, which is why a neighbour's server code takes that one.
const CHANNEL_SURFACES = new Set(contract.channelSurfaces)
const NODE_BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))

// `actions.ts` is compiler-constrained, not just path-constrained: every value export of a
// top-level `'use server'` module must be an async function. Next.js rejects some other values at
// build time and checks the rest with `typeof` when the module loads, so an export produced by a
// call — `withAuth(async () => …)`, next-safe-action's `client.action(…)` — is legal. The rule
// reports only what syntax proves is not an async function, including a class, which passes the
// `typeof` check and then fails when called, and leaves calls and member reads to Next.js instead
// of guessing wrapper names.
const ACTION_FUNCTION_NODES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])
const ACTION_NON_FUNCTION_NODES = new Set([
  'Literal',
  'TemplateLiteral',
  'ObjectExpression',
  'ArrayExpression',
  'ClassExpression',
  'ClassDeclaration',
  'TSEnumDeclaration',
  'UnaryExpression',
  'UpdateExpression',
  'BinaryExpression',
])
const ACTION_TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'])
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/

// A declaration beside a JavaScript surface names the same surface: `server.d.ts` is `server`.
// Only a real declaration suffix does; `server.d.js` is a file called `server.d`.
const DECLARATION_EXT = /\.d\.[cm]?ts$/
const stem = (value) => {
  const name = path.basename(value)
  return DECLARATION_EXT.test(name) ? name.replace(DECLARATION_EXT, '') : name.replace(SOURCE_EXT, '')
}

function moduleLocation(absolute) {
  const parts = relativeParts(MODULE_ROOT, absolute)
  if (!parts || parts.length < 2) return null

  const tail = parts.slice(1)
  const rootName = tail.length === 1 ? stem(tail[0]) : null
  const rootIsSegmentDirectory =
    tail.length === 1 &&
    SEGMENTS.has(rootName) &&
    !SOURCE_EXT.test(tail[0]) &&
    // Derived from the one exported list: written out by hand it omitted the NodeNext extensions,
    // so a segment directory shadowed by a `.mts` file was not recognised as shadowed.
    !SOURCE_EXTENSIONS.some((extension) => fs.existsSync(`${absolute}.${extension}`))
  return {
    capability: parts[0],
    tail,
    segment: tail.length > 1 ? tail[0] : rootIsSegmentDirectory ? rootName : null,
    surface: tail.length === 1 && !rootIsSegmentDirectory ? rootName : null,
  }
}

function sharedLocation(absolute) {
  const parts = relativeParts(SHARED_ROOT, absolute)
  if (!parts || parts.length < 1) return null
  return { root: parts[0], tail: parts.slice(1) }
}

function isAppFile(absolute) {
  return relativeParts(APP_ROOT, absolute) !== null
}

// Files Next.js finds by name directly under the source root, so they cannot move into a contract
// root. `next.config.*` is linted only when the source root is the project root.
const FRAMEWORK_ROOT_FILES = new Set([
  'proxy',
  'middleware',
  'instrumentation',
  'instrumentation-client',
  'mdx-components',
  'next.config',
])

function isFrameworkRootFile(absolute) {
  const parts = relativeParts(SOURCE_ROOT, absolute)
  return parts?.length === 1 && FRAMEWORK_ROOT_FILES.has(stem(parts[0]))
}

/**
 * A source file under no contract root. Every rule keys on the root a file sits in, so such a file
 * matched none of them: `src/lib/helper.ts` could deep-import a capability, and `app/**` could then
 * import the result through it cleanly. Declaration files carry no runtime behaviour, and development
 * artifacts are outside the production graph by the same definition the cycle check uses.
 */
function isUnownedFile(absolute) {
  const parts = relativeParts(SOURCE_ROOT, absolute)
  if (!parts || isFrameworkRootFile(absolute) || isToolingFile(absolute)) return false
  if ([MODULE_ROOT, APP_ROOT, SHARED_ROOT].some((root) => isWithin(root, absolute))) return false
  if (isGeneratedFile(absolute) || /\.d\.[cm]?ts$/.test(absolute)) return false
  return !isDevelopmentArtifactPath(absolute)
}

/**
 * Tooling the project keeps beside its source when the project root is the source root: the
 * installed rules and the config files next to package.json. It is not product source that lacks
 * an owner, so it is not reported; it is still read like a route, so a file there cannot carry a
 * deep import for one.
 */
function isToolingFile(absolute) {
  if (isWithin(path.join(PROJECT_ROOT, 'rules'), absolute)) return true
  const parts = relativeParts(SOURCE_ROOT, absolute)
  return SOURCE_ROOT === PROJECT_ROOT && parts?.length === 1 && /\.config\.[cm]?[jt]s$/.test(parts[0])
}

/**
 * A development artifact by name or directory, judged on the file an import actually resolves to.
 * Below the module root the filter starts under the capability, because a capability may be called
 * `mocks`. Under the app root a plain directory is a route segment, so `app/tests/page.ts` ships;
 * only private (`__mocks__`) folders count there.
 */
function isDevelopmentArtifactPath(absolute) {
  const file = resolveSourceFile(absolute)
  const parts = relativeParts(MODULE_ROOT, file)?.slice(1) ?? relativeParts(SOURCE_ROOT, file)
  if (!parts) return false
  const folders = (names) => (fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() ? names : names.slice(0, -1))
  const directories = isAppFile(file)
    ? folders(relativeParts(APP_ROOT, file)).filter((name) => name.startsWith('_'))
    : folders(parts)
  return isDevelopmentArtifactFile(file) || directories.some(isDevelopmentArtifactDirectory)
}

// The file a resolved specifier names: itself, the same path with a source extension (or with its
// `.js` swapped for one), or a directory's index; a directory specifier (trailing separator) names
// only the index. Anything else is returned unchanged, so a directory the resolver enters some
// other way (`package.json` `main`) is judged as a directory.
const resolveSourceFile = (absolute) => sourceFileAt(absolute) ?? absolute

// Composition reads capabilities through their root public surfaces: `app/**`, the framework root
// files and any unowned file, which would otherwise launder a deep import for `app/**`.
const isCompositionFile = (absolute) =>
  isAppFile(absolute) || isFrameworkRootFile(absolute) || isUnownedFile(absolute) || isToolingFile(absolute)

function isRuntimePackage(specifier) {
  const builtin = specifier.replace(/^node:/, '').split('/')[0]
  if (NODE_BUILTINS.has(builtin)) return true
  return isClassified(specifier, RUNTIME_PACKAGES)
}

function isAdapterLocation(module, shared) {
  return ['server', 'client'].includes(module?.segment) || ['server', 'client'].includes(shared?.root)
}

// `ui/` is a directory, not a runtime: a file there with the directive in its prologue is a
// Client Component, one without it is a view any runtime may render.
function isClientTarget(module, shared, absolute) {
  if (module?.segment === 'ui') return fileDirectives(resolveSourceFile(absolute)).includes('use client')
  return isClientLocation(module, shared)
}

// Code only a browser may load: the capability's browser lifecycle and its marked surface.
function isBrowserOnlyTarget(module, shared) {
  return (
    module?.segment === 'client' ||
    shared?.root === 'client' ||
    Boolean(module?.surface && CLIENT_SURFACES.has(module.surface) && module.surface !== 'ui')
  )
}

// The directives a program opens with, as the compiler reads them: string statements before the
// first statement of another kind.
function programDirectives(programNode) {
  const directives = []
  for (const statement of programNode.body) {
    // The parser marks a directive; a parenthesised string is the same literal without the mark.
    if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') break
    directives.push(statement.directive)
  }
  return directives
}

function isServerLocation(module, shared) {
  return (
    module?.segment === 'server' ||
    (module?.surface && SERVER_SURFACES.has(module.surface)) ||
    shared?.root === 'server'
  )
}

function isServerSourceLocation(module, shared) {
  return (
    module?.segment === 'server' ||
    (module?.surface && SERVER_EXECUTION_SURFACES.has(module.surface)) ||
    shared?.root === 'server'
  )
}

function isClientLocation(module, shared) {
  return (
    ['client', 'ui'].includes(module?.segment) ||
    (module?.surface && CLIENT_SURFACES.has(module.surface)) ||
    ['client', 'ui'].includes(shared?.root)
  )
}

function isForeignContract(sourceModule, targetModule) {
  return Boolean(
    targetModule?.surface &&
      CONTRACT_SURFACES.has(targetModule.surface) &&
      targetModule.capability !== sourceModule?.capability
  )
}

/**
 * A type-only edge disappears from the build, so the rules whose harm is a runtime one — a browser
 * bundle reaching a server module, an impure runtime dependency inside `domain/` — have nothing to
 * report. The ownership rules still apply: importing a neighbour's private file couples this file to
 * it whether or not the binding survives compilation.
 */
function isTypeOnlyEdge(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true
  // Under `verbatimModuleSyntax` an inline `type` specifier leaves `import {} from '…'` behind,
  // which still loads the module.
  if (paths.verbatimModuleSyntax) return false
  const specifiers = node.specifiers ?? []
  // `every()` on an empty list is true, and `import {} from './x'` still loads the module for its
  // side effects. Only a non-empty, wholly type-only specifier list erases the edge.
  return (
    specifiers.length > 0 &&
    specifiers.every(
      (specifier) => specifier.importKind === 'type' || specifier.exportKind === 'type'
    )
  )
}

/**
 * The specifier a node names, or null when the target is computed. A template literal with no
 * substitutions is a string written with different quotes — reporting it as a hidden target told
 * authors to hide a constant they had already written down.
 */
function constantSpecifier(node) {
  if (node?.type === 'Literal') return typeof node.value === 'string' ? node.value : null
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null
  }
  return null
}

// `require(…)` and `module.require(…)` / `module['require'](…)`, and nothing else: any property
// named `require` would read `loader.require(name)` — an ordinary method call — as a module edge.
function isRequireCallee(callee) {
  if (callee.type === 'Identifier') return callee.name === 'require'
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'module') return false
  return callee.computed
    ? callee.property.type === 'Literal' && callee.property.value === 'require'
    : callee.property.type === 'Identifier' && callee.property.name === 'require'
}

// `require.context(…)` and `import.meta.webpackContext(…)` load every module a directory holds.
// What the compiler leaves of an expression once its assertions are erased.
function erased(node) {
  let inner = node
  while (['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion'].includes(inner?.type)) {
    inner = inner.expression
  }
  return inner
}

// The name of a member, written after a dot or as a literal in brackets; a bundler reads both.
const memberName = (member) => (member.computed ? constantSpecifier(erased(member.property)) : member.property.name)

// `import.meta`, and not `new.target`, which is the same kind of node.
const isImportMeta = (node) => node?.type === 'MetaProperty' && node.meta.name === 'import' && node.property.name === 'meta'

function isContextLoader(callee) {
  if (callee.type !== 'MemberExpression') return false
  const object = erased(callee.object)
  if (memberName(callee) === 'context') return object.type === 'Identifier' && object.name === 'require'
  return memberName(callee) === 'webpackContext' && isImportMeta(object)
}

function isTestFile(filename) {
  return /(?:^|\/)__tests__(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(posix(filename))
}

const capabilityRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce capability ownership and server/client import boundaries.',
    },
    schema: [],
    messages: {
      appInternal:
        'app/** and files outside the contract roots may import {{capability}} only through a root public surface, not {{target}}.',
      devArtifactInProduction:
        'Production code must not import the development artifact {{target}}. A fixture or mock a production file reaches is runtime code: move it to an owned location, or keep the import in a test.',
      unknownRoot:
        '{{path}} sits outside the contract roots ({{roots}}). Move it into a capability, an app segment or an admitted shared root; only framework root files ({{frameworkFiles}}) may stay at the source root.',
      crossCapabilityInternal:
        '{{source}} may import {{targetCapability}} only through a root public surface, not {{target}}.',
      domainDirection:
        "domain/** is pure and may import only its own domain, admitted shared/kernel code, or a neighbour's contracts.ts.",
      applicationDirection:
        'application/** owns framework-neutral policy. Supply runtime adapters instead of importing {{target}}.',
      browserServer:
        'Browser-safe code, including every file under ui/**, must not import the server surface {{target}}.',
      serverClient:
        'Server capability code must not import the browser surface {{target}}.',
      clientBoundaryMissing:
        "{{target}} is browser-only code. A ui/** file that imports it is a Client Component and opens with 'use client'; a view without the directive renders in either runtime.",
      unclassifiedPackage:
        '{{target}} is not classified in purePackages. domain/**, application/**, shared/kernel and runtime-neutral surfaces import only packages the contract classifies as pure.',
      foreignChannel:
        "{{target}} is another capability's channel surface: it resolves identity and reports for its own request. Server code calls the neighbour's server.ts with explicit identity.",
      providerOutsideAdapter:
        '{{target}} is a store or provider package. Import it from a private server/ or client/ segment or from shared/server or shared/client, and reach it through the capability surface.',
      appIsLeaf:
        'Nothing outside app/** imports from it; {{target}} is route-private. Move what is reused into a capability or an admitted shared root.',
      packageByPath:
        '{{target}} reaches into node_modules by path, which names a file and not the entry point the contract classifies. Import the package by its name.',
      ambiguousResolution:
        'This specifier resolves to different project files depending on how it is loaded ({{files}}), and the rules do not guess which one loads. Point every condition and entry field at one file, or import the file by its path.',
      frameworkRootImport:
        '{{target}} is loaded by the framework under its own name. Nothing imports it: move what is reused into a capability or an admitted shared root.',
      toolingImport:
        '{{target}} is tooling beside the source, not product code. Import the capability surface it was reaching instead.',
      outsideSourceRoot:
        '{{target}} is a source file outside sourceRoot, where no boundary rule reads it. Move it under a contract root.',
      privateServerBackedge:
        'Private server implementation must not import its own public surface {{target}}. Move shared contracts inward.',
      generatedProviderLeak:
        'Generated provider contracts must stay inside generatedRoot or a capability private server segment.',
      neutralDirection:
        'A runtime-neutral surface may import only its own domain or admitted shared/kernel code.',
      sharedImportsModule:
        'shared/** must remain capability-neutral and cannot import {{capability}}.',
      invalidSharedRoot:
        '{{sharedRoot}}/{{root}} is not admitted. Use an admitted runtime-specific shared root.',
      sharedKernelDirection:
        'shared/kernel must remain pure and capability-neutral.',
      unknownSurface:
        '{{surface}} is not a public capability surface. Admitted surfaces: {{admitted}}.',
      shadowedSegmentIndex:
        '{{path}} is shadowed by the {{surface}} root surface. Import the explicit root surface or a named private file.',
      broadSurface:
        'A public capability surface must be narrow. export * exposes module internals.',
      actionReexport:
        'actions.ts must declare async Server Actions locally. Next.js rejects value re-exports from a top-level use server module.',
      actionDirective:
        "actions.ts must open with the 'use server' directive. Without it the file is an ordinary server module, and the browser code that imports it bundles the server.",
      actionValueExport:
        '{{name}} is a value export from actions.ts that is not an async function. A top-level use server module exposes only async functions; Next.js rejects some other values at build time and the rest at runtime.',
      hiddenDynamicImport:
        'A computed import or a context loader hides its target from architecture checks. Use a literal specifier or an explicit reviewed exception.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename()
    if (!filename || filename === '<input>' || isTestFile(filename)) return {}

    const sourceModule = moduleLocation(filename)
    const sourceShared = sharedLocation(filename)
    // `actions.d.ts` describes the signatures of `actions.js`. It is a surface for ownership, and
    // not a `'use server'` module: the export rules of one do not apply to it.
    const isActionModule = sourceModule?.surface === 'actions' && !DECLARATION_EXT.test(filename)
    let sourceIsClientDirective = false

    const reportImport = (node, specifier, { typeOnly = false } = {}) => {
      if (typeof specifier !== 'string') {
        context.report({ node, messageId: 'hiddenDynamicImport' })
        return
      }
      // An edge is judged against every target it can load; which one a runtime picks depends on
      // conditions the rule would otherwise have to guess.
      // A declaration file is erased whole, so every edge in it is a type edge.
      const erased = typeOnly || DECLARATION_EXT.test(filename)
      for (const target of resolveEdgeTargets(paths, filename, specifier, { typeOnly: erased })) {
        judgeTarget(node, target, erased)
      }
    }

    const judgeTarget = (node, { file: targetPath = null, package: specifier, names, aliases = [], byPath, ambiguous }, typeOnly) => {
      if (ambiguous) {
        context.report({
          node,
          messageId: 'ambiguousResolution',
          data: { files: ambiguous.map((file) => posix(path.relative(PROJECT_ROOT, file))).sort().join(', ') },
        })
        return
      }
      if (!targetPath && byPath) {
        context.report({ node, messageId: 'packageByPath', data: { target: specifier } })
        return
      }
      if (!targetPath) {
        // A package answers to every name the resolution gave it; a list that names any of them
        // classifies it. A restriction holds as well for what the project calls the package —
        // the name it is installed under and the spelling of the import — so an entry the
        // contract writes against an alias is not ignored. A permission is earned by what was
        // loaded and never by what it is called.
        const classified = (list) => [...names].some((name) => isClassified(name, list))
        const called = [...names, ...aliases, specifier]
        const restricted = (list) => called.some((name) => isClassified(name, list))
        // The pure zones are held to an allow-list, for a type as much as for a value: a signature
        // typed with a provider client is that provider's vocabulary inside policy, and a package
        // the contract never classified is not known to be pure. A runtime-neutral surface is a
        // pure zone too, which is what lets `contracts.ts` import the schema library that
        // witnesses its own types.
        const pureZone =
          sourceModule?.surface && NEUTRAL_SURFACES.has(sourceModule.surface)
            ? 'neutralDirection'
            : sourceModule?.segment === 'domain' || sourceShared?.root === 'kernel'
              ? 'domainDirection'
              : sourceModule?.segment === 'application'
                ? 'applicationDirection'
                : null
        if (pureZone) {
          if (called.some(isRuntimePackage) || restricted(SERVER_PACKAGES)) {
            context.report({ node, messageId: pureZone, data: { target: specifier } })
          } else if (!classified(PURE_PACKAGES)) {
            context.report({ node, messageId: 'unclassifiedPackage', data: { target: specifier } })
          }
          return
        }
        // The browser-only marker makes whatever imports it browser-only: a view that loads it
        // could no longer be rendered by a server file.
        if (!typeOnly && sourceModule?.segment === 'ui' && !sourceIsClientDirective && names.has('client-only')) {
          context.report({ node, messageId: 'clientBoundaryMissing', data: { target: specifier } })
          return
        }
        // What only a server can load never reaches a browser bundle: ui.ts publishes every
        // ui/** file to the browser, so a view is held to this with or without the directive.
        if (
          !typeOnly &&
          (sourceIsClientDirective || isClientLocation(sourceModule, sourceShared)) &&
          ([...names].some((name) => name.startsWith('node:')) || restricted(SERVER_PACKAGES))
        ) {
          context.report({ node, messageId: 'browserServer', data: { target: specifier } })
          return
        }
        // A provider's types are its vocabulary, so the rule holds for a type edge as well: a
        // provider type re-exported by a root surface would reach policy as a published type.
        if (
          restricted(PROVIDER_PACKAGES) &&
          !isAdapterLocation(sourceModule, sourceShared) &&
          !isGeneratedFile(filename)
        ) {
          context.report({ node, messageId: 'providerOutsideAdapter', data: { target: specifier } })
        }
        return
      }

      const targetModule = moduleLocation(targetPath)
      const targetShared = sharedLocation(targetPath)
      const targetLabel = posix(path.relative(PROJECT_ROOT, targetPath))
      // The vocabulary rules below let one kind of type edge through: a type a capability
      // publishes from a root surface. Every other type edge names something private or
      // provider-shaped, and is judged as the value edge would be.
      const publishedType =
        typeOnly && Boolean(targetModule?.surface && PUBLIC_SURFACES.has(targetModule.surface))

      // Tooling beside the source is read like a route and is not a way round a rule that only
      // names its target, so product code does not import it.
      if (isToolingFile(targetPath) && !isToolingFile(filename)) {
        context.report({ node, messageId: 'toolingImport', data: { target: targetLabel } })
        return
      }

      // The framework loads its root files by name and in a runtime of its own choosing. An
      // import of one takes that runtime and everything the file loads along with it. A
      // declaration of the same name is not a file the framework loads.
      if (isFrameworkRootFile(targetPath) && !DECLARATION_EXT.test(targetPath) && !isToolingFile(filename)) {
        context.report({ node, messageId: 'frameworkRootImport', data: { target: targetLabel } })
        return
      }

      // A file outside sourceRoot matches no rule and is linted by nobody, so a re-export there
      // launders any import into production. Data and declaration files carry no behaviour to
      // launder, and a development artifact is not production: no production file may import
      // one, so what it reaches outside the source root stays outside.
      if (!isWithin(SOURCE_ROOT, targetPath) && !isDevelopmentArtifactPath(filename)) {
        const targetFile = resolveSourceFile(targetPath)
        if (SOURCE_EXT.test(targetFile) && !/\.d\.[cm]?ts$/.test(targetFile)) {
          context.report({ node, messageId: 'outsideSourceRoot', data: { target: targetLabel } })
          return
        }
      }

      // Exempting development artifacts by name left a bridge — `mocks/bridge.ts` re-exporting a
      // private file, imported by a route — outside every check: the bridge was unowned but
      // exempt, and the route saw an import from outside the module roots. Whether a fixture is
      // test-only is decided by its consumers, so a production file may not import one.
      if (!isDevelopmentArtifactPath(filename) && isDevelopmentArtifactPath(targetPath)) {
        context.report({
          node,
          messageId: 'devArtifactInProduction',
          data: { target: targetLabel },
        })
        return
      }

      // The route composes capabilities and owns nothing that outlives it, so no dependency
      // points back at one, as a type or as a value.
      if (isAppFile(targetPath) && !isAppFile(filename)) {
        context.report({ node, messageId: 'appIsLeaf', data: { target: targetLabel } })
        return
      }

      if (!publishedType && sourceModule?.surface && NEUTRAL_SURFACES.has(sourceModule.surface)) {
        const ownDomain =
          targetModule?.capability === sourceModule.capability && targetModule.segment === 'domain'
        if (!ownDomain && targetShared?.root !== 'kernel') {
          context.report({ node, messageId: 'neutralDirection' })
          return
        }
      }

      // A generated provider row is the provider's shape, not the product's. Let it past the private
      // adapter that translates it and every consumer downstream is coupled to a file a code
      // generator rewrites. Checked before the shared/module rules because it is about WHAT the
      // target is, not about which root it sits in.
      if (
        isGeneratedFile(targetPath) &&
        !isGeneratedFile(filename) &&
        sourceModule?.segment !== 'server'
      ) {
        context.report({ node, messageId: 'generatedProviderLeak' })
        return
      }

      if (sourceShared && targetModule) {
        context.report({
          node,
          messageId: 'sharedImportsModule',
          data: { capability: targetModule.capability },
        })
        return
      }

      if (
        targetModule &&
        isCompositionFile(filename) &&
        (!targetModule.surface || !PUBLIC_SURFACES.has(targetModule.surface))
      ) {
        context.report({
          node,
          messageId: 'appInternal',
          data: { capability: targetModule.capability, target: targetLabel },
        })
        return
      }

      if (
        sourceModule &&
        targetModule &&
        sourceModule.capability !== targetModule.capability &&
        (!targetModule.surface || !PUBLIC_SURFACES.has(targetModule.surface))
      ) {
        context.report({
          node,
          messageId: 'crossCapabilityInternal',
          data: {
            source: sourceModule.capability,
            targetCapability: targetModule.capability,
            target: targetLabel,
          },
        })
        return
      }

      if (
        !typeOnly &&
        targetModule?.surface &&
        CHANNEL_SURFACES.has(targetModule.surface) &&
        sourceModule &&
        sourceModule.capability !== targetModule.capability &&
        isServerSourceLocation(sourceModule, sourceShared)
      ) {
        context.report({ node, messageId: 'foreignChannel', data: { target: targetLabel } })
        return
      }

      if (!publishedType && sourceModule?.segment === 'domain') {
        const ownDomain =
          targetModule?.capability === sourceModule.capability && targetModule.segment === 'domain'
        if (
          !ownDomain &&
          targetShared?.root !== 'kernel' &&
          !isForeignContract(sourceModule, targetModule)
        ) {
          context.report({ node, messageId: 'domainDirection' })
          return
        }
      }

      if (!publishedType && sourceShared?.root === 'kernel') {
        const sameKernel = targetShared?.root === 'kernel'
        if (!sameKernel) {
          context.report({ node, messageId: 'sharedKernelDirection' })
          return
        }
      }

      if (!publishedType && sourceModule?.segment === 'application') {
        const ownPolicy =
          targetModule?.capability === sourceModule.capability &&
          ['domain', 'application'].includes(targetModule.segment)
        if (
          !ownPolicy &&
          targetShared?.root !== 'kernel' &&
          !isForeignContract(sourceModule, targetModule)
        ) {
          context.report({
            node,
            messageId: 'applicationDirection',
            data: { target: targetLabel },
          })
          return
        }
      }

      // A file under `ui/` imports no server code under either directive, so everything `ui.ts`
      // publishes is safe for a browser importer. As a target the directive decides: a view
      // without it is renderable from `server/**`, where the Server Component that reads lives
      // and from where `rsc.ts` publishes it; a Client Component is not named by server code.
      const sourceIsClient = sourceIsClientDirective || isClientLocation(sourceModule, sourceShared)
      const sourceIsServer = isServerSourceLocation(sourceModule, sourceShared)
      const targetIsClient = isClientTarget(targetModule, targetShared, targetPath)
      const targetIsServer = isServerLocation(targetModule, targetShared)

      // A view that reaches browser-only code stops being renderable on the server, and the
      // marker in that code would fail the build of whatever server file renders the view.
      if (
        !typeOnly &&
        sourceModule?.segment === 'ui' &&
        !sourceIsClientDirective &&
        isBrowserOnlyTarget(targetModule, targetShared)
      ) {
        context.report({ node, messageId: 'clientBoundaryMissing', data: { target: targetLabel } })
        return
      }

      if (!typeOnly && sourceIsClient && targetIsServer) {
        context.report({
          node,
          messageId: 'browserServer',
          data: { target: targetLabel },
        })
        return
      }

      if (!typeOnly && sourceIsServer && targetIsClient) {
        context.report({
          node,
          messageId: 'serverClient',
          data: { target: targetLabel },
        })
        return
      }

      // Runtime-neutral surfaces are the explicit exception to the private-server backedge rule.
      if (
        sourceModule?.segment === 'server' &&
        targetModule?.capability === sourceModule.capability &&
        targetModule.surface &&
        PUBLIC_SURFACES.has(targetModule.surface) &&
        !NEUTRAL_SURFACES.has(targetModule.surface)
      ) {
        context.report({
          node,
          messageId: 'privateServerBackedge',
          data: { target: targetLabel },
        })
      }
    }

    // The export's shape, decided from syntax. `reexport` is a binding imported from elsewhere and
    // published unchanged, which is the value re-export `actionReexport` names, written in two
    // statements instead of one.
    const classifyActionValue = (node, programNode, depth = 0) => {
      if (node == null) return 'nonAction'
      if (depth > 8) return 'unknown'
      if (ACTION_TYPE_WRAPPERS.has(node.type)) {
        return classifyActionValue(node.expression, programNode, depth + 1)
      }
      if (ACTION_FUNCTION_NODES.has(node.type)) return node.async === true ? 'unknown' : 'nonAction'
      if (ACTION_NON_FUNCTION_NODES.has(node.type)) return 'nonAction'
      if (node.type !== 'Identifier') return 'unknown'
      const sourceCode = context.sourceCode ?? context.getSourceCode()
      const scope = sourceCode.getScope(programNode)
      const variable = scope.set.get(node.name) ?? scope.childScopes[0]?.set.get(node.name)
      const definition = variable?.defs[0]
      if (!definition) return node.name === 'undefined' ? 'nonAction' : 'unknown'
      if (definition.type === 'ImportBinding') return 'reexport'
      if (definition.type === 'TSEnumName') return 'nonAction'
      if (definition.type === 'FunctionName' || definition.type === 'ClassName') {
        return classifyActionValue(definition.node, programNode, depth + 1)
      }
      if (definition.type === 'Variable') {
        return classifyActionValue(definition.node.init, programNode, depth + 1)
      }
      return 'unknown'
    }

    const checkActionExports = (programNode) => {
      // Only the directive prologue counts: a string statement after the first import is an
      // expression the compiler ignores, not a directive.
      if (!programDirectives(programNode).includes('use server')) {
        context.report({ node: programNode, messageId: 'actionDirective' })
      }

      const reportValue = (node, name, value = node) => {
        const kind = classifyActionValue(value, programNode)
        if (kind === 'reexport') context.report({ node, messageId: 'actionReexport' })
        else if (kind === 'nonAction') {
          context.report({ node, messageId: 'actionValueExport', data: { name } })
        }
      }

      for (const statement of programNode.body) {
        if (statement.type === 'ExportDefaultDeclaration') {
          reportValue(statement, 'default', statement.declaration)
          continue
        }
        if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') continue
        const declaration = statement.declaration
        if (declaration) {
          if (declaration.type === 'VariableDeclaration') {
            for (const declarator of declaration.declarations) {
              reportValue(declarator, declarator.id.name ?? 'binding', declarator.init)
            }
          } else if (declaration.declare !== true) {
            reportValue(declaration, declaration.id?.name ?? 'value')
          }
          continue
        }
        // `export { helper }` without a source: a local binding. Re-exports with a source are the
        // ExportNamedDeclaration visitor's `actionReexport`.
        if (!statement.source) {
          for (const specifier of statement.specifiers) {
            if (specifier.exportKind === 'type') continue
            const name = specifier.local.name ?? specifier.local.value
            reportValue(specifier, name, specifier.local)
          }
        }
      }
    }

    return {
      Program(node) {
        sourceIsClientDirective = programDirectives(node).includes('use client')

        // A declaration file describes a surface; it carries no directive and exports no action.
        if (isActionModule) checkActionExports(node)

        if (isUnownedFile(filename)) {
          context.report({
            node,
            messageId: 'unknownRoot',
            data: {
              path: posix(path.relative(PROJECT_ROOT, filename)),
              roots: [MODULE_ROOT, APP_ROOT, SHARED_ROOT]
                .map((root) => posix(path.relative(PROJECT_ROOT, root)))
                .join(', '),
              frameworkFiles: [...FRAMEWORK_ROOT_FILES].join(', '),
            },
          })
        }

        if (sourceModule?.surface && !PUBLIC_SURFACES.has(sourceModule.surface)) {
          context.report({
            node,
            messageId: 'unknownSurface',
            data: {
              surface: path.basename(filename),
              admitted: [...PUBLIC_SURFACES].sort().join(', '),
            },
          })
        }

        if (
          sourceModule?.segment &&
          sourceModule.tail.length === 2 &&
          /^index\.[cm]?[jt]sx?$/.test(path.basename(filename)) &&
          PUBLIC_SURFACES.has(sourceModule.segment)
        ) {
          context.report({
            node,
            messageId: 'shadowedSegmentIndex',
            data: {
              path: posix(path.relative(PROJECT_ROOT, filename)),
              surface: `${sourceModule.segment}.ts`,
            },
          })
        }

        if (sourceShared && !SHARED_ROOTS.has(sourceShared.root)) {
          context.report({
            node,
            messageId: 'invalidSharedRoot',
            data: {
              root: sourceShared.root,
              sharedRoot: posix(path.relative(PROJECT_ROOT, SHARED_ROOT)),
            },
          })
        }
      },

      ImportDeclaration(node) {
        reportImport(node.source, node.source.value, { typeOnly: isTypeOnlyEdge(node) })
      },

      // `import x = require('…')` is a static module edge that the ImportDeclaration visitor never
      // sees, so every boundary rule was blind to it.
      TSImportEqualsDeclaration(node) {
        const reference = node.moduleReference
        if (reference?.type !== 'TSExternalModuleReference') return
        const value = reference.expression?.value
        reportImport(reference.expression, typeof value === 'string' ? value : null, {
          typeOnly: node.importKind === 'type',
        })
      },

      ExportNamedDeclaration(node) {
        if (node.source) {
          if (
            isActionModule &&
            node.exportKind !== 'type' &&
            node.specifiers.some((specifier) => specifier.exportKind !== 'type')
          ) {
            context.report({ node, messageId: 'actionReexport' })
          }
          reportImport(node.source, node.source.value, { typeOnly: isTypeOnlyEdge(node) })
        }
      },

      ExportAllDeclaration(node) {
        if (isActionModule && node.exportKind !== 'type') {
          context.report({ node, messageId: 'actionReexport' })
        } else if (sourceModule?.surface) {
          context.report({ node, messageId: 'broadSurface' })
        }
        reportImport(node.source, node.source.value, { typeOnly: isTypeOnlyEdge(node) })
      },

      ImportExpression(node) {
        reportImport(node.source, constantSpecifier(node.source))
      },

      // `type X = import('…').Y` and `typeof import('…')` name a module in a type position. The
      // ImportDeclaration visitor never sees them, so without this an `import type` that fails
      // ownership passed when rewritten in this form.
      TSImportType(node) {
        // typescript-eslint 8.x moved the specifier from `argument` (a TSLiteralType) to `source`;
        // read the new key first so the deprecated one is touched only on older parsers.
        const literal =
          node.source ?? (node.argument?.type === 'TSLiteralType' ? node.argument.literal : null)
        reportImport(literal ?? node, literal ? constantSpecifier(literal) : null, { typeOnly: true })
      },

      // `new URL('./worker.ts', import.meta.url)` is how a bundler is told to load a file, a
      // worker above all: an edge like an import when the path is a literal. A computed path
      // names an asset chosen at run time and is not a module the rule can place.
      NewExpression(node) {
        const callee = erased(node.callee)
        if (callee.type !== 'Identifier' || callee.name !== 'URL' || node.arguments.length !== 2) return
        const [target, base] = node.arguments.map(erased)
        if (base.type !== 'MemberExpression' || !isImportMeta(erased(base.object)) || memberName(base) !== 'url') return
        const reference = constantSpecifier(target)
        const specifier = typeof reference === 'string' ? urlSpecifier(reference, filename, paths) : null
        if (specifier !== null) reportImport(target, specifier)
      },

      CallExpression(node) {
        // A context loader names a directory: which modules it loads is hidden from every check.
        if (isContextLoader(node.callee)) {
          context.report({ node, messageId: 'hiddenDynamicImport' })
          return
        }
        if (!isRequireCallee(node.callee)) return
        const argument = node.arguments[0]
        reportImport(argument ?? node, argument ? constantSpecifier(argument) : null)
      },
    }
  },
}

const plugin = {
  meta: { name: 'nextjs-clean-architecture', version: contract.contractVersion },
  rules: { boundaries: capabilityRule },
}

export default [
  {
    files: [sourceFilesPattern(paths)],
    plugins: { 'clean-architecture': plugin },
    rules: {
      'clean-architecture/boundaries': 'error',
    },
  },
]
