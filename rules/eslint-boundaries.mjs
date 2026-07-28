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
import { fileURLToPath } from 'node:url'

const contract = JSON.parse(
  fs.readFileSync(new URL('./architecture-contract.json', import.meta.url), 'utf8')
)

function findProjectRoot(start) {
  let current = start
  while (true) {
    if (
      fs.existsSync(path.join(current, 'package.json')) &&
      fs.existsSync(path.join(current, 'src'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(
        'Cannot find a project root with package.json and src/ above eslint-boundaries.mjs'
      )
    }
    current = parent
  }
}

const PROJECT_ROOT = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)))
const SEGMENTS = new Set(contract.segments)
const PUBLIC_SURFACES = new Set(contract.publicSurfaces)
const SERVER_SURFACES = new Set(contract.serverSurfaces)
const SERVER_EXECUTION_SURFACES = new Set(contract.serverExecutionSurfaces)
const CLIENT_SURFACES = new Set(contract.clientSurfaces)
const SHARED_ROOTS = new Set(contract.sharedRoots)
const RUNTIME_PACKAGES = new Set(contract.runtimePackages)
const NODE_BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/

const posix = (value) => value.split(path.sep).join('/')
const stem = (value) => path.basename(value).replace(SOURCE_EXT, '')

function projectParts(absolute) {
  const relative = posix(path.relative(PROJECT_ROOT, absolute))
  if (relative === '..' || relative.startsWith('../')) return null
  return relative.split('/')
}

function moduleLocation(absolute) {
  const parts = projectParts(absolute)
  if (!parts || parts[0] !== 'src' || parts[1] !== 'modules' || parts.length < 4) return null

  const tail = parts.slice(3)
  const rootName = tail.length === 1 ? stem(tail[0]) : null
  const rootIsSegmentDirectory =
    tail.length === 1 &&
    SEGMENTS.has(rootName) &&
    !SOURCE_EXT.test(tail[0]) &&
    !['.js', '.jsx', '.ts', '.tsx'].some((extension) => fs.existsSync(`${absolute}${extension}`))
  return {
    capability: parts[2],
    tail,
    segment: tail.length > 1 ? tail[0] : rootIsSegmentDirectory ? rootName : null,
    surface: tail.length === 1 && !rootIsSegmentDirectory ? rootName : null,
  }
}

function sharedLocation(absolute) {
  const parts = projectParts(absolute)
  if (!parts || parts[0] !== 'src' || parts[1] !== 'shared' || parts.length < 3) return null
  return { root: parts[2], tail: parts.slice(3) }
}

function isAppFile(absolute) {
  const parts = projectParts(absolute)
  return parts?.[0] === 'src' && parts[1] === 'app'
}

function resolveProjectImport(importer, specifier) {
  if (specifier.startsWith('@/')) {
    return path.join(PROJECT_ROOT, 'src', specifier.slice(2))
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(importer), specifier)
  }
  return null
}

function packageRoot(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 1).join('/')
  return specifier.split('/')[0]
}

function isRuntimePackage(specifier) {
  const builtin = specifier.replace(/^node:/, '').split('/')[0]
  if (NODE_BUILTINS.has(builtin)) return true
  if (RUNTIME_PACKAGES.has(specifier)) return true
  const root = packageRoot(specifier)
  return RUNTIME_PACKAGES.has(root)
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
      sharedImportsModule:
        'shared/** must remain capability-neutral and cannot import {{capability}}.',
      invalidSharedRoot:
        'src/shared/{{root}} is not admitted. Use shared/kernel, shared/server, shared/client, or shared/ui.',
      sharedKernelDirection:
        'shared/kernel must remain pure and capability-neutral.',
      unknownSurface:
        '{{surface}} is not a public capability surface. Admitted surfaces: {{admitted}}.',
      shadowedSegmentIndex:
        '{{path}} is shadowed by the {{surface}} root surface. Import the explicit root surface or a named private file.',
      broadSurface:
        'A public capability surface must be narrow. export * exposes module internals.',
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

    const reportImport = (node, specifier) => {
      if (typeof specifier !== 'string') {
        context.report({ node, messageId: 'hiddenDynamicImport' })
        return
      }

      const targetPath = resolveProjectImport(filename, specifier)
      if (!targetPath) {
        if (
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

      if (sourceModule?.segment === 'domain') {
        const ownDomain =
          targetModule?.capability === sourceModule.capability && targetModule.segment === 'domain'
        if (!ownDomain && targetShared?.root !== 'kernel') {
          context.report({ node, messageId: 'domainDirection' })
          return
        }
      }

      if (sourceShared?.root === 'kernel') {
        const sameKernel = targetShared?.root === 'kernel'
        if (!sameKernel) {
          context.report({ node, messageId: 'sharedKernelDirection' })
          return
        }
      }

      if (sourceModule?.segment === 'application') {
        const ownPolicy =
          targetModule?.capability === sourceModule.capability &&
          ['domain', 'application'].includes(targetModule.segment)
        if (!ownPolicy && targetShared?.root !== 'kernel') {
          context.report({
            node,
            messageId: 'applicationDirection',
            data: { target: targetLabel },
          })
          return
        }
      }

      const sourceIsClient =
        sourceIsClientDirective || isClientLocation(sourceModule, sourceShared)
      const sourceIsServer = isServerSourceLocation(sourceModule, sourceShared)
      const targetIsClient = isClientLocation(targetModule, targetShared)
      const targetIsServer = isServerLocation(targetModule, targetShared)

      if (sourceIsClient && targetIsServer) {
        context.report({
          node,
          messageId: 'browserServer',
          data: { target: targetLabel },
        })
        return
      }

      if (sourceIsServer && targetIsClient) {
        context.report({
          node,
          messageId: 'serverClient',
          data: { target: targetLabel },
        })
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
            data: { root: sourceShared.root },
          })
        }
      },

      ImportDeclaration(node) {
        reportImport(node.source, node.source.value)
      },

      ExportNamedDeclaration(node) {
        if (node.source) reportImport(node.source, node.source.value)
      },

      ExportAllDeclaration(node) {
        if (sourceModule?.surface) context.report({ node, messageId: 'broadSurface' })
        reportImport(node.source, node.source.value)
      },

      ImportExpression(node) {
        const value =
          node.source.type === 'Literal' && typeof node.source.value === 'string'
            ? node.source.value
            : null
        reportImport(node.source, value)
      },

      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return
        const argument = node.arguments[0]
        const value =
          argument?.type === 'Literal' && typeof argument.value === 'string'
            ? argument.value
            : null
        reportImport(argument ?? node, value)
      },
    }
  },
}

const plugin = {
  meta: { name: 'nextjs-clean-architecture', version: '2.0.0' },
  rules: { boundaries: capabilityRule },
}

export default [
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: { 'clean-architecture': plugin },
    rules: {
      'clean-architecture/boundaries': 'error',
    },
  },
]
