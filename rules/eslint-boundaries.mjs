/**
 * Capability ownership and runtime boundaries.
 *
 * Copy this file with architecture-contract.json and spread the exported array after the base
 * flat ESLint configs. The rule deliberately protects a small architectural floor. Semantic
 * depth, authorization, cache ownership, and report-once behavior require review and runtime tests.
 */

import fs from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'

import {
  contractSurfaceExports,
  existingSourceFile,
  isWithin,
  loadArchitecturePaths,
  posix,
  relativeParts,
  resolveProjectImport,
  sourceFilesPattern,
  SOURCE_EXTENSIONS,
} from './contract-paths.mjs'

const paths = loadArchitecturePaths(import.meta.url)
const {
  contract,
  projectRoot: PROJECT_ROOT,
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
// A contract surface publishes the capability's vocabulary — its types and the schemas that witness
// them — and nothing that runs. A neighbour's `domain/` and `application/` may read it, because
// depending on a published vocabulary is not depending on an implementation; every other surface of
// that neighbour stays closed to them. The promise is enforced, not assumed: a value taken from a
// contract surface must be a schema by declaration, so behaviour has to be taken from its owner or
// restated as a port.
const CONTRACT_SURFACES = new Set(contract.contractSurfaces ?? [])
const PURE_PACKAGES = Array.isArray(contract.purePackages) ? contract.purePackages : []
// Optional and validated by contract-paths. A repository with no generated provider contracts
// simply does not declare it; absent means "this project has none", not "unchecked".
const isGeneratedFile = absolute => GENERATED_ROOT !== null && isWithin(GENERATED_ROOT, absolute)
const SHARED_ROOTS = new Set(contract.sharedRoots)
const RUNTIME_PACKAGES = new Set(contract.runtimePackages)
const NODE_BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/

const stem = (value) => path.basename(value).replace(SOURCE_EXT, '')

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

// A package's identity is its name, and a scoped name is two segments. Returning `@scope` made
// every subpath of a forbidden `@scope/pkg` inherit the class of the *scope*, so `@scope/pkg/sub`
// matched nothing the contract listed and walked into `domain/`.
function packageRoot(specifier) {
  const parts = specifier.split('/')
  if (specifier.startsWith('@')) return parts.slice(0, 2).join('/')
  return parts[0]
}

// The contract may classify a scope (`@supabase`), a package (`@scope/pkg`) or an exact specifier;
// a subpath inherits the class of the package and of the scope above it.
function packageIdentities(specifier) {
  const bare = specifier.replace(/^node:/, '')
  const identities = [specifier, bare, packageRoot(bare)]
  if (bare.startsWith('@')) identities.push(bare.split('/')[0])
  return identities
}

function isRuntimePackage(specifier) {
  const builtin = specifier.replace(/^node:/, '').split('/')[0]
  if (NODE_BUILTINS.has(builtin)) return true
  return packageIdentities(specifier).some((identity) => RUNTIME_PACKAGES.has(identity))
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

// The names an import or a re-export binds as runtime values. A namespace, default or `export *`
// binding takes the whole surface, so it is reported as `*`.
function valueBindings(node) {
  if (node.type === 'ExportAllDeclaration') return ['*']
  return (node.specifiers ?? [])
    .filter((specifier) => specifier.importKind !== 'type' && specifier.exportKind !== 'type')
    .map((specifier) => {
      if (specifier.type === 'ImportSpecifier') {
        return specifier.imported.name ?? specifier.imported.value
      }
      if (specifier.type === 'ExportSpecifier') {
        return specifier.local.name ?? specifier.local.value
      }
      return '*'
    })
}

function edgeFacts(node) {
  const typeOnly = isTypeOnlyEdge(node)
  return { typeOnly, bindings: typeOnly ? [] : valueBindings(node) }
}

/**
 * The bindings this import takes from a contract surface that are behaviour by declaration. An
 * unreadable target yields null: the file not being there is `import/no-unresolved`'s report, not
 * this rule's.
 */
function contractBehaviourNames(targetPath, bindings) {
  const file = existingSourceFile(targetPath)
  if (file === null) return null
  const published = contractSurfaceExports(file, { paths, purePackages: PURE_PACKAGES })
  if (!published) return null
  const offending = []
  for (const name of bindings) {
    if (name !== '*') {
      if ((published.kinds.get(name) ?? 'behaviour') === 'behaviour') offending.push(name)
      continue
    }
    if (!published.complete) {
      offending.push('*')
      continue
    }
    for (const [exported, kind] of published.kinds) {
      if (kind === 'behaviour') offending.push(exported)
    }
  }
  return [...new Set(offending)]
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
        'app/** may import {{capability}} only through a root public surface, not {{target}}.',
      crossCapabilityInternal:
        '{{source}} may import {{targetCapability}} only through a root public surface, not {{target}}.',
      domainDirection:
        'domain/** is pure and may import only its own domain or admitted shared/kernel code.',
      applicationDirection:
        'application/** owns framework-neutral policy. Supply runtime adapters instead of importing {{target}}.',
      browserServer:
        'Browser-safe code must not import the server surface {{target}}.',
      serverClient:
        'Server capability code must not import the browser surface {{target}}.',
      serverUiReach:
        'A Server Component under ui/** reads its capability through rsc.ts only; {{target}} is private server code or another server surface.',
      privateServerBackedge:
        'Private server implementation must not import its own public surface {{target}}. Move shared contracts inward.',
      generatedProviderLeak:
        'Generated provider contracts must stay inside generatedRoot or a capability private server segment.',
      contractSurfaceBehaviour:
        'A contract surface publishes vocabulary, not behaviour: {{names}} is a runtime value by declaration. Import it as a type, or take the behaviour from its owner.',
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
        '{{name}} is a value export from actions.ts that is not an async function. A top-level use server module exposes only async functions; anything else fails the Next.js build.',
      hiddenDynamicImport:
        'A computed import hides its target from architecture checks. Use a literal specifier or an explicit reviewed exception.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename()
    if (!filename || filename === '<input>' || isTestFile(filename)) return {}

    const sourceModule = moduleLocation(filename)
    const sourceShared = sharedLocation(filename)
    let sourceIsClientDirective = false

    const reportImport = (node, specifier, { typeOnly = false, bindings = [] } = {}) => {
      if (typeof specifier !== 'string') {
        context.report({ node, messageId: 'hiddenDynamicImport' })
        return
      }

      const targetPath = resolveProjectImport(paths, filename, specifier)
      if (!targetPath) {
        if (typeOnly) return
        // A runtime-neutral surface is held to the same package rule as `domain/`: a package the
        // contract classifies as pure is admitted, a runtime-bound one is not. Refusing every
        // package made `contracts.ts` unable to import the schema library that witnesses its own
        // types, which is the only reason the surface exists.
        if (
          sourceModule?.surface &&
          NEUTRAL_SURFACES.has(sourceModule.surface) &&
          isRuntimePackage(specifier)
        ) {
          context.report({ node, messageId: 'neutralDirection' })
        } else if (
          (sourceModule?.segment === 'domain' || sourceShared?.root === 'kernel') &&
          isRuntimePackage(specifier)
        ) {
          context.report({ node, messageId: 'domainDirection' })
        } else if (sourceModule?.segment === 'application' && isRuntimePackage(specifier)) {
          context.report({
            node,
            messageId: 'applicationDirection',
            data: { target: specifier },
          })
        }
        return
      }

      const targetModule = moduleLocation(targetPath)
      const targetShared = sharedLocation(targetPath)
      const targetLabel = posix(path.relative(PROJECT_ROOT, targetPath))

      if (targetModule?.surface && CONTRACT_SURFACES.has(targetModule.surface) && bindings.length > 0) {
        const behaviour = contractBehaviourNames(targetPath, bindings)
        if (behaviour && behaviour.length > 0) {
          context.report({
            node,
            messageId: 'contractSurfaceBehaviour',
            data: { names: behaviour.join(', ') },
          })
          return
        }
      }

      if (!typeOnly && sourceModule?.surface && NEUTRAL_SURFACES.has(sourceModule.surface)) {
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
        isAppFile(filename) &&
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

      if (!typeOnly && sourceModule?.segment === 'domain') {
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

      if (!typeOnly && sourceShared?.root === 'kernel') {
        const sameKernel = targetShared?.root === 'kernel'
        if (!sameKernel) {
          context.report({ node, messageId: 'sharedKernelDirection' })
          return
        }
      }

      if (!typeOnly && sourceModule?.segment === 'application') {
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

      // `ui/` is a directory, not a runtime. Under the App Router a file there without a
      // `'use client'` directive is a Server Component, and reading its own capability's `rsc.ts`
      // is what it is for. Classifying the directory as browser code forced every server-rendered
      // capability view into `server/`, where `ui.ts` may not publish it. `client/` stays browser
      // code by contract: it holds browser lifecycle, which has no server reading.
      const sourceIsClient =
        sourceIsClientDirective ||
        (sourceModule?.segment !== 'ui' && isClientLocation(sourceModule, sourceShared))
      const sourceIsServer = isServerSourceLocation(sourceModule, sourceShared)
      const targetIsClient = isClientLocation(targetModule, targetShared)
      const targetIsServer = isServerLocation(targetModule, targetShared)

      // A Server Component under ui/** reads its capability through rsc.ts and nothing else on the
      // server side: private server/** and the other server surfaces are what rsc.ts exists to
      // narrow, and the directive-based classification above must not widen them.
      if (
        !typeOnly &&
        sourceModule?.segment === 'ui' &&
        !sourceIsClientDirective &&
        targetModule?.capability === sourceModule.capability &&
        (targetModule.segment === 'server' || (targetModule.surface && targetIsServer && targetModule.surface !== 'rsc'))
      ) {
        context.report({
          node,
          messageId: 'serverUiReach',
          data: { target: targetLabel },
        })
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

    // `actions.ts` is compiler-constrained, not just path-constrained: Next.js accepts only async
    // functions as value exports of a top-level `'use server'` module. The docs promised the check
    // and only the re-export half of it was written; a sync export or a missing directive passed
    // lint and failed the target's build.
    const isAsyncFunctionNode = (node) =>
      node != null &&
      (node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression') &&
      node.async === true

    const isAsyncBinding = (programNode, name) => {
      const sourceCode = context.sourceCode ?? context.getSourceCode()
      const scope = sourceCode.getScope(programNode)
      const variable = scope.set.get(name) ?? scope.childScopes[0]?.set.get(name)
      const definition = variable?.defs[0]
      if (!definition) return false
      if (definition.type === 'FunctionName') return isAsyncFunctionNode(definition.node)
      if (definition.type === 'Variable') return isAsyncFunctionNode(definition.node.init)
      return false
    }

    const checkActionExports = (programNode) => {
      // Only the directive prologue counts: a string statement after the first import is an
      // expression the compiler ignores, not a directive.
      let prologueHasDirective = false
      for (const statement of programNode.body) {
        if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'Literal') break
        if (statement.expression.value === 'use server') prologueHasDirective = true
      }
      if (!prologueHasDirective) context.report({ node: programNode, messageId: 'actionDirective' })

      const reportValue = (node, name) =>
        context.report({ node, messageId: 'actionValueExport', data: { name } })

      for (const statement of programNode.body) {
        if (statement.type === 'ExportDefaultDeclaration') {
          const declaration = statement.declaration
          if (isAsyncFunctionNode(declaration)) continue
          if (declaration.type === 'Identifier' && isAsyncBinding(programNode, declaration.name)) continue
          reportValue(statement, 'default')
          continue
        }
        if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') continue
        const declaration = statement.declaration
        if (declaration) {
          if (declaration.type === 'FunctionDeclaration') {
            if (!declaration.async) reportValue(declaration, declaration.id?.name ?? 'function')
          } else if (declaration.type === 'VariableDeclaration') {
            for (const declarator of declaration.declarations) {
              if (!isAsyncFunctionNode(declarator.init)) {
                reportValue(declarator, declarator.id.name ?? 'binding')
              }
            }
          } else if (declaration.type === 'ClassDeclaration' || declaration.type === 'TSEnumDeclaration') {
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
            if (!isAsyncBinding(programNode, name)) reportValue(specifier, name)
          }
        }
      }
    }

    return {
      Program(node) {
        sourceIsClientDirective = node.body.some(
          (statement) =>
            statement.type === 'ExpressionStatement' &&
            statement.expression.type === 'Literal' &&
            statement.expression.value === 'use client'
        )

        if (sourceModule?.surface === 'actions') checkActionExports(node)

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
        reportImport(node.source, node.source.value, edgeFacts(node))
      },

      // `import x = require('…')` is a static module edge that the ImportDeclaration visitor never
      // sees, so every boundary rule was blind to it.
      TSImportEqualsDeclaration(node) {
        const reference = node.moduleReference
        if (reference?.type !== 'TSExternalModuleReference') return
        const value = reference.expression?.value
        reportImport(reference.expression, typeof value === 'string' ? value : null, {
          typeOnly: node.importKind === 'type',
          bindings: ['*'],
        })
      },

      ExportNamedDeclaration(node) {
        if (node.source) {
          if (
            sourceModule?.surface === 'actions' &&
            node.exportKind !== 'type' &&
            node.specifiers.some((specifier) => specifier.exportKind !== 'type')
          ) {
            context.report({ node, messageId: 'actionReexport' })
          }
          reportImport(node.source, node.source.value, edgeFacts(node))
        }
      },

      ExportAllDeclaration(node) {
        if (sourceModule?.surface === 'actions' && node.exportKind !== 'type') {
          context.report({ node, messageId: 'actionReexport' })
        } else if (sourceModule?.surface) {
          context.report({ node, messageId: 'broadSurface' })
        }
        reportImport(node.source, node.source.value, edgeFacts(node))
      },

      ImportExpression(node) {
        reportImport(node.source, constantSpecifier(node.source), { bindings: ['*'] })
      },

      CallExpression(node) {
        if (!isRequireCallee(node.callee)) return
        const argument = node.arguments[0]
        reportImport(argument ?? node, argument ? constantSpecifier(argument) : null, {
          bindings: ['*'],
        })
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
