#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

import { fail, root } from './_lib.mjs'
import { loadArchitecturePaths, moduleSpecifiers } from '../rules/contract-paths.mjs'

const BASE = 'rules/eslint-boundaries.mjs'
const STRICT = 'rules/eslint-boundaries-resolved.mjs'
const CONTRACT = 'rules/architecture-contract.json'
const PATHS = 'rules/contract-paths.mjs'
const CYCLES = 'rules/check-module-cycles.mjs'
const errors = []

let sandboxSummary = 'sandbox skipped'
let ESLint
try {
  ;({ ESLint } = await import('eslint'))
} catch {
  errors.push('eslint is not installed; architecture rules were not executed')
}

const files = {
  'src/generated/provider-rows.ts': `
export type WorkItemRow = { id: string; title: string }
`,
  'src/generated/provider-api.ts': `
import type { WorkItemRow } from './provider-rows.js'
export type ProviderResult = { row: WorkItemRow }
`,
  // Legal: a private server adapter is exactly where a provider row is translated.
  'src/modules/work-items/server/rows.ts': `
import type { WorkItemRow } from '@/generated/provider-rows'
export const idOf = (row: WorkItemRow) => row.id
`,
  // Illegal: past the adapter, and every consumer downstream is coupled to a generated file.
  'src/modules/work-items/domain/bad-generated.ts': `
import type { WorkItemRow } from '@/generated/provider-rows'
export const titleOf = (row: WorkItemRow) => row.title
`,
  'src/modules/labels/server/store.ts': `
export function listLabels() {
  return []
}
`,
  'src/modules/labels/server.ts': `
export { listLabels } from './server/store.js'
`,
  'src/modules/labels/actions.ts': `
'use server'
export async function createLabel() {
  return { ok: true }
}
`,
  'src/modules/work-items/domain/model.ts': `
export interface WorkItem {
  id: string
}
`,
  'src/modules/work-items/query-cache.ts': `
import type { WorkItem } from './domain/model.js'
export const workItemKeys = {
  list: () => ['work-items'] as const,
  detail: (id: WorkItem['id']) => ['work-items', id] as const,
}
`,
  'src/modules/work-items/application/list.ts': `
import type { WorkItem } from '../domain/model.js'
export function list(items: WorkItem[]) {
  return items
}
`,
  'src/modules/work-items/server/store.ts': `
import type { WorkItem } from '../domain/model.js'
export function getWorkItems(): WorkItem[] {
  return []
}
`,
  'src/modules/work-items/server.ts': `
export { getWorkItems } from './server/store.js'
`,
  'src/modules/work-items/rsc.ts': `
import { getWorkItems } from './server.js'
import { workItemKeys } from './query-cache.js'
export const workItemsRscQueryKey = workItemKeys.list()
export async function readWorkItems() {
  return getWorkItems()
}
`,
  'src/modules/work-items/actions.ts': `
'use server'
export async function createWorkItem() {
  return { ok: true }
}
`,
  // The directive is the runtime boundary; folder placement alone does not make a module client.
  'src/modules/work-items/client/query.ts': `
'use client'
import { createWorkItem } from '../actions.js'
import { workItemKeys } from '../query-cache.js'
export const mutation = createWorkItem
export const queryKey = workItemKeys.list()
`,
  // Runtime-neutral surfaces are the exception to the private-server backedge rule.
  'src/modules/work-items/server/prefetch.ts': `
import { workItemKeys } from '../query-cache.js'
export const prefetchKey = workItemKeys.list()
`,
  'src/modules/work-items/client.ts': `
export { mutation } from './client/query.js'
`,
  'src/modules/work-items/ui/view.ts': `
import { mutation } from '../client.js'
export const viewModel = mutation
`,
  'src/modules/work-items/ui/WorkItemsView/index.tsx': `
export const NestedWorkItemsView = () => null
`,
  'src/modules/work-items/ui.ts': `
export { viewModel } from './ui/view.js'
`,
  'src/modules/board/server/adapters.ts': `
import { listLabels } from '../../labels/server.js'
export const loadLabels = listLabels
`,
  'src/modules/board/server.ts': `
export { loadLabels } from './server/adapters.js'
`,
  'src/app/work-items/page.ts': `
import { readWorkItems } from '@/modules/work-items/rsc'
export default readWorkItems
`,
  'src/shared/kernel/id.ts': `
export type Id = string
`,
  'src/shared/server/logger.ts': `
export const logger = console
`,
  'src/shared/client/events.ts': `
export const events = new EventTarget()
`,
  'src/shared/server/bad-generated.ts': `
import type { WorkItemRow } from '../../generated/provider-rows.js'
export const idOf = (row: WorkItemRow) => row.id
`,
  'src/modules/work-items/client/bad-generated.ts': `
import type { WorkItemRow } from '../../../generated/provider-rows.js'
export const idOf = (row: WorkItemRow) => row.id
`,

  // Ownership.
  'src/app/bad-internal/page.ts': `
import { listLabels } from '@/modules/labels/server/store'
export default listLabels
`,
  'src/modules/board/server/bad-internal.ts': `
import { listLabels } from '../../labels/server/store.js'
export default listLabels
`,

  // Purity and dependency direction.
  'src/modules/work-items/domain/bad-server.ts': `
import { getWorkItems } from '../server/store.js'
export default getWorkItems
`,
  'src/modules/work-items/domain/bad-framework.ts': `
import { revalidateTag } from 'next/cache'
export default revalidateTag
`,
  'src/modules/work-items/domain/bad-builtin.ts': `
import fs from 'node:fs'
export default fs
`,
  'src/modules/work-items/application/bad-server.ts': `
import { getWorkItems } from '../server/store.js'
export default getWorkItems
`,
  'src/modules/work-items/application/bad-provider.ts': `
import { createClient } from '@supabase/supabase-js'
export default createClient
`,
  'src/modules/work-items/application/bad-driver.ts': `
import pg from 'pg'
export default pg
`,

  // Runtime separation.
  'src/modules/work-items/client/bad-server.ts': `
import { getWorkItems } from '../server.js'
export default getWorkItems
`,
  'src/app/bad-client/page.tsx': `
'use client'
import { getWorkItems } from '@/modules/work-items/server'
export default getWorkItems
`,
  'src/modules/work-items/server/bad-client.ts': `
import { mutation } from '../client.js'
export default mutation
`,
  'src/modules/bad-actions/actions.ts': `
'use server'
import { mutation } from '../work-items/client.js'
export default mutation
`,
  'src/modules/bad-action-export/actions.ts': `
'use server'
export { getWorkItems } from '../work-items/server.js'
`,

  // Public and shared vocabulary.
  'src/modules/work-items/repository.ts': `
export const repository = {}
`,
  'src/modules/exports/server/internal.ts': `
export const internal = true
`,
  'src/modules/exports/server.ts': `
export * from './server/internal.js'
`,
  'src/shared/utils/date.ts': `
export const now = Date.now
`,
  'src/shared/direct.ts': `
import { getWorkItems } from '@/modules/work-items/server/store'
export const direct = getWorkItems
`,
  'src/shared/server/bad-module.ts': `
import { listLabels } from '@/modules/labels/server'
export default listLabels
`,
  'src/shared/kernel/bad-server.ts': `
import { logger } from '../server/logger.js'
export default logger
`,
  'src/shared/client/bad-server.ts': `
import { logger } from '../server/logger.js'
export default logger
`,

  // A target hidden from the architecture rule and the strict resolver canaries.
  'src/modules/work-items/server/hidden-dynamic.ts': `
const name = './store.js'
export const load = () => import(name)
`,
  'src/modules/work-items/server/public-backedge.ts': `
import { createWorkItem } from '../actions.js'
export const leakedAction = createWorkItem
`,
  'src/modules/bad-neutral/query-cache.ts': `
import { revalidateTag } from 'next/cache'
export const key = revalidateTag
`,
  'src/modules/bad-neutral-local/server/store.ts': `
export const store = true
`,
  'src/modules/bad-neutral-local/query-cache.ts': `
import { store } from './server/store.js'
export const key = store
`,
  'src/modules/work-items/server/index.tsx': `
export const shadowed = true
`,
  'src/modules/work-items/ui/WorkItemsView/index.tsx': `
export const NestedWorkItemsView = () => null
`,
  'src/app/unresolved/page.ts': `
import { missing } from '@/modules/missing/server'
export default missing
`,
  'src/modules/cycle-a/server.ts': `
import { b } from '../cycle-b/server.js'
export const a = b
`,
  // A type-only cycle is a cycle: the contract requires the module dependency graph to be acyclic,
  // without qualification. Erasing type edges from the AST extractor made this graph report none.
  'src/modules/cycle-type-a/server.ts': `
import type { B } from '../cycle-type-b/server.js'
export type A = { b: B }
`,
  'src/modules/cycle-type-b/server.ts': `
import type { A } from '../cycle-type-a/server.js'
export type B = { a?: A }
`,
  // The same cycle in NodeNext extensions, written with the `.mjs` specifiers TypeScript expects.
  // The resolver settings listed js/jsx/ts/tsx only, so these resolved to nothing and the canary
  // passed over a real cycle.
  'src/modules/cycle-mts-a/server.mts': `
import { b } from '../cycle-mts-b/server.mjs'
export const a = b
`,
  'src/modules/cycle-mts-b/server.mts': `
import { a } from '../cycle-mts-a/server.mjs'
export const b = a
`,
  'src/modules/cycle-b/server.ts': `
import { a } from '../cycle-a/server.js'
export const b = a
`,
  'src/modules/graph-a/server.ts': `
export const graphA = true
`,
  'src/modules/graph-a/server/use-b.ts': `
import { graphB } from '../../graph-b/server.js'
export const useB = graphB
`,
  'src/modules/graph-b/server.ts': `
export const graphB = true
`,
  'src/modules/graph-b/server/use-a.ts': `
import { graphA } from '../../graph-a/server.js'
export const useA = graphA
`,

  // A NodeNext-extension file is a source file. The rules only see what their glob matches, and the
  // glob listed js/jsx/ts/tsx only — so this file was outside the architecture entirely while the
  // import parser could still see imports into it. The two halves of the floor disagreed about what
  // the project contains, and the narrower one was the one that judges.
  'src/modules/nodenext/domain/bad-internal.mts': `
import { getWorkItems } from '../../work-items/server/store.js'
export default getWorkItems
`,
}

const expectedBase = new Map([
  ['src/modules/work-items/domain/bad-generated.ts', 'generatedProviderLeak'],
  ['src/app/bad-internal/page.ts', 'appInternal'],
  ['src/modules/board/server/bad-internal.ts', 'crossCapabilityInternal'],
  ['src/modules/work-items/domain/bad-server.ts', 'domainDirection'],
  ['src/modules/work-items/domain/bad-framework.ts', 'domainDirection'],
  ['src/modules/work-items/domain/bad-builtin.ts', 'domainDirection'],
  ['src/modules/work-items/application/bad-server.ts', 'applicationDirection'],
  ['src/modules/work-items/application/bad-provider.ts', 'applicationDirection'],
  ['src/modules/work-items/application/bad-driver.ts', 'applicationDirection'],
  ['src/modules/work-items/client/bad-server.ts', 'browserServer'],
  ['src/app/bad-client/page.tsx', 'browserServer'],
  ['src/modules/work-items/server/bad-client.ts', 'serverClient'],
  ['src/modules/bad-actions/actions.ts', 'serverClient'],
  ['src/modules/bad-action-export/actions.ts', 'actionReexport'],
  ['src/modules/work-items/repository.ts', 'unknownSurface'],
  ['src/modules/exports/server.ts', 'broadSurface'],
  ['src/shared/utils/date.ts', 'invalidSharedRoot'],
  ['src/shared/direct.ts', 'invalidSharedRoot'],
  ['src/shared/server/bad-module.ts', 'sharedImportsModule'],
  ['src/shared/kernel/bad-server.ts', 'sharedKernelDirection'],
  ['src/shared/client/bad-server.ts', 'browserServer'],
  ['src/shared/server/bad-generated.ts', 'generatedProviderLeak'],
  ['src/modules/work-items/client/bad-generated.ts', 'generatedProviderLeak'],
  ['src/modules/work-items/server/hidden-dynamic.ts', 'hiddenDynamicImport'],
  ['src/modules/work-items/server/public-backedge.ts', 'privateServerBackedge'],
  ['src/modules/work-items/server/index.tsx', 'shadowedSegmentIndex'],
  ['src/modules/bad-neutral/query-cache.ts', 'neutralDirection'],
  ['src/modules/bad-neutral-local/query-cache.ts', 'neutralDirection'],
  ['src/modules/nodenext/domain/bad-internal.mts', 'crossCapabilityInternal'],
])

const expectedStrict = new Map([
  ['src/app/unresolved/page.ts', 'import/no-unresolved'],
  ['src/modules/cycle-a/server.ts', 'import/no-cycle'],
  ['src/modules/cycle-b/server.ts', 'import/no-cycle'],
  ['src/modules/cycle-mts-a/server.mts', 'import/no-cycle'],
  ['src/modules/cycle-mts-b/server.mts', 'import/no-cycle'],
])

const clean = new Set([
  'src/generated/provider-api.ts',
  // The permitting half of generatedProviderLeak: a private server adapter IS where a provider row
  // is translated, so this import must stay clean or the rule only proves it can say no.
  'src/modules/work-items/server/rows.ts',
  'src/modules/labels/server.ts',
  'src/modules/labels/actions.ts',
  'src/modules/work-items/application/list.ts',
  'src/modules/work-items/query-cache.ts',
  'src/modules/work-items/server.ts',
  'src/modules/work-items/rsc.ts',
  'src/modules/work-items/actions.ts',
  'src/modules/work-items/ui/WorkItemsView/index.tsx',
  'src/modules/work-items/client/query.ts',
  'src/modules/work-items/client.ts',
  'src/modules/work-items/ui/view.ts',
  'src/modules/work-items/ui/WorkItemsView/index.tsx',
  'src/modules/work-items/ui.ts',
  'src/modules/board/server/adapters.ts',
  'src/modules/work-items/server/prefetch.ts',
  'src/modules/board/server.ts',
  'src/app/work-items/page.ts',
  'src/shared/kernel/id.ts',
  'src/shared/server/logger.ts',
  'src/shared/client/events.ts',
  'src/modules/graph-a/server.ts',
  'src/modules/graph-a/server/use-b.ts',
  'src/modules/graph-b/server.ts',
  'src/modules/graph-b/server/use-a.ts',
])

if (ESLint) {
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'capability-rules-')))
  const previousCwd = process.cwd()
  try {
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{"private":true,"type":"module"}\n')
    for (const source of [BASE, STRICT, CONTRACT, PATHS, CYCLES]) {
      fs.copyFileSync(path.join(root, source), path.join(sandbox, path.basename(source)))
    }
    // `generatedRoot` is deliberately absent from the shipped contract: declared there, every repo
    // adopting the floor would inherit a generated root it never has. The sandbox declares it so the
    // rule has something to bind to; the inert-when-absent case is asserted separately below.
    fs.writeFileSync(
      path.join(sandbox, 'architecture-contract.json'),
      `${JSON.stringify(
        { ...JSON.parse(fs.readFileSync(path.join(root, CONTRACT), 'utf8')), generatedRoot: 'src/generated' },
        null,
        2
      )}\n`
    )
    fs.writeFileSync(
      path.join(sandbox, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['./src/*'] },
            module: 'esnext',
            moduleResolution: 'bundler',
            target: 'esnext',
          },
          include: ['src'],
        },
        null,
        2
      )}\n`
    )

    const parser = `import parser from '@typescript-eslint/parser'\nconst ts = { files: ['src/**/*.{ts,tsx,mts,cts}'], languageOptions: { parser } }\n`
    fs.writeFileSync(
      path.join(sandbox, 'eslint.config.base.mjs'),
      `${parser}import boundaries from './eslint-boundaries.mjs'\nexport default [ts, ...boundaries]\n`
    )
    fs.writeFileSync(
      path.join(sandbox, 'eslint.config.strict.mjs'),
      `${parser}import boundaries from './eslint-boundaries.mjs'\nimport strict from './eslint-boundaries-resolved.mjs'\nexport default [ts, ...boundaries, ...strict]\n`
    )

    for (const [relative, source] of Object.entries(files)) {
      const absolute = path.join(sandbox, relative)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, `${source.trim()}\n`)
    }

    const nestedCwd = path.join(sandbox, 'src', 'app', 'work-items')
    process.chdir(nestedCwd)

    const lint = async (config) => {
      const eslint = new ESLint({
        cwd: sandbox,
        overrideConfigFile: path.join(sandbox, config),
      })
      const results = await eslint.lintFiles(['src'])
      return new Map(
        results.map((result) => [posix(path.relative(sandbox, result.filePath)), result.messages])
      )
    }

    const posix = (value) => value.split(path.sep).join('/')
    const baseResults = await lint('eslint.config.base.mjs')
    const strictResults = await lint('eslint.config.strict.mjs')
    const graphResult = spawnSync(process.execPath, [path.join(sandbox, path.basename(CYCLES))], {
      cwd: nestedCwd,
      encoding: 'utf8',
    })

    for (const [file, messageId] of expectedBase) {
      const messages = baseResults.get(file) ?? []
      if (
        !messages.some(
          (message) =>
            message.ruleId === 'clean-architecture/boundaries' &&
            message.messageId === messageId
        )
      ) {
        errors.push(
          `${file}: expected clean-architecture/boundaries:${messageId}; received ${messages
            .map((message) => `${message.ruleId}:${message.messageId ?? message.message}`)
            .join(', ')}`
        )
      }
    }

    for (const [file, ruleId] of expectedStrict) {
      const messages = strictResults.get(file) ?? []
      if (!messages.some((message) => message.ruleId === ruleId)) {
        errors.push(
          `${file}: expected ${ruleId}; received ${messages
            .map((message) => message.ruleId)
            .join(', ')}`
        )
      }
    }

    const graphOutput = `${graphResult.stdout}${graphResult.stderr}`
    // A type-only cycle is still a cycle: the contract requires an acyclic module graph without
    // qualification.
    if (!graphOutput.includes('cycle-type-a -> cycle-type-b -> cycle-type-a')) {
      errors.push(`type-only capability cycle canary failed: received ${graphOutput.trim() || `exit ${graphResult.status}`}`)
    }
    if (
      graphResult.status === 0 ||
      !graphOutput.includes('graph-a -> graph-b -> graph-a')
    ) {
      errors.push(
        `capability cycle canary failed: expected graph-a -> graph-b -> graph-a, received ${graphOutput.trim() || `exit ${graphResult.status}`}`
      )
    }

    fs.rmSync(path.join(sandbox, 'src/modules/graph-b/server/use-a.ts'))
    fs.rmSync(path.join(sandbox, 'src/modules/cycle-b/server.ts'))
    fs.rmSync(path.join(sandbox, 'src/modules/cycle-mts-b/server.mts'))
    fs.rmSync(path.join(sandbox, 'src/modules/cycle-type-b/server.ts'))

    // A development-directory word is allowed as the capability name. The filter starts below that
    // boundary; applying it to the first segment makes a real production cycle disappear.
    for (const capability of ['test', 'tests', 'mocks', 'fixtures']) {
      const partner = `zz-${capability}-partner`
      const capabilityFile = path.join(sandbox, 'src/modules', capability, 'server.ts')
      const partnerFile = path.join(sandbox, 'src/modules', partner, 'server.ts')
      fs.mkdirSync(path.dirname(capabilityFile), { recursive: true })
      fs.mkdirSync(path.dirname(partnerFile), { recursive: true })
      fs.writeFileSync(
        capabilityFile,
        `import { partner } from '../${partner}/server.js'\nexport const value = partner\n`
      )
      fs.writeFileSync(
        partnerFile,
        `import { value } from '../${capability}/server.js'\nexport const partner = value\n`
      )

      const namedCapabilityGraph = spawnSync(
        process.execPath,
        [path.join(sandbox, path.basename(CYCLES))],
        { cwd: nestedCwd, encoding: 'utf8' }
      )
      const namedCapabilityOutput = `${namedCapabilityGraph.stdout}${namedCapabilityGraph.stderr}`
      if (
        namedCapabilityGraph.status === 0 ||
        !namedCapabilityOutput.includes(`${capability} -> ${partner} -> ${capability}`)
      ) {
        errors.push(
          `capability-name cycle canary failed for ${capability}: ${namedCapabilityOutput.trim() || `exit ${namedCapabilityGraph.status}`}`
        )
      }
      fs.rmSync(path.join(sandbox, 'src/modules', capability), { recursive: true, force: true })
      fs.rmSync(path.join(sandbox, 'src/modules', partner), { recursive: true, force: true })
    }

    const cleanGraphResult = spawnSync(
      process.execPath,
      [path.join(sandbox, path.basename(CYCLES))],
      {
        cwd: nestedCwd,
        encoding: 'utf8',
      }
    )
    if (cleanGraphResult.status !== 0) {
      errors.push(
        `clean capability graph failed: ${`${cleanGraphResult.stdout}${cleanGraphResult.stderr}`.trim() || `exit ${cleanGraphResult.status}`}`
      )
    }

    for (const file of clean) {
      for (const [tier, results] of [
        ['base', baseResults],
        ['strict', strictResults],
      ]) {
        const messages = results.get(file) ?? []
        const architectureErrors = messages.filter(
          (message) =>
            message.severity === 2 &&
            (message.ruleId === 'clean-architecture/boundaries' ||
              message.ruleId === 'import/no-unresolved' ||
              message.ruleId === 'import/no-cycle')
        )
        if (architectureErrors.length > 0) {
          errors.push(
            `${file}: clean fixture failed in ${tier}: ${architectureErrors
              .map((message) => `${message.ruleId}: ${message.message}`)
              .join('; ')}`
          )
        }
      }
    }

    const portable = path.join(sandbox, 'portable-layout')
    fs.mkdirSync(path.join(portable, 'rules'), { recursive: true })
    for (const source of [BASE, STRICT, PATHS, CYCLES]) {
      fs.copyFileSync(path.join(root, source), path.join(portable, 'rules', path.basename(source)))
    }
    fs.writeFileSync(path.join(portable, 'package.json'), '{"private":true,"type":"module"}\n')
    fs.writeFileSync(
      path.join(portable, 'rules', 'architecture-contract.json'),
      `${JSON.stringify(
        {
          ...JSON.parse(fs.readFileSync(path.join(root, CONTRACT), 'utf8')),
          sourceRoot: 'product',
          moduleRoot: 'product/capabilities',
          appRoot: 'product/routes',
          sharedRoot: 'product/common',
          importAliases: { '~/': 'product/' },
        },
        null,
        2
      )}\n`
    )
    fs.writeFileSync(
      path.join(portable, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            paths: { '~/*': ['./product/*'] },
            module: 'esnext',
            moduleResolution: 'bundler',
            target: 'esnext',
          },
          include: ['product'],
        },
        null,
        2
      )}\n`
    )
    fs.writeFileSync(
      path.join(portable, 'eslint.config.mjs'),
      `import parser from '@typescript-eslint/parser'\nimport boundaries from './rules/eslint-boundaries.mjs'\nimport strict from './rules/eslint-boundaries-resolved.mjs'\nexport default [{ files: ['product/**/*.{ts,tsx}'], languageOptions: { parser } }, ...boundaries, ...strict]\n`
    )

    const portableFiles = {
      'product/capabilities/labels/server/store.ts': 'export const listLabels = () => []',
      'product/capabilities/labels/server.ts':
        "export { listLabels } from './server/store.js'",
      'product/routes/bad/page.ts':
        "import { listLabels } from '~/capabilities/labels/server/store'\nexport default listLabels",
      'product/capabilities/cycle-a/server.ts':
        "import { b } from '~/capabilities/cycle-b/server'\nexport const a = b",
      'product/capabilities/cycle-b/server.ts':
        "import { a } from '~/capabilities/cycle-a/server'\nexport const b = a",
    }
    for (const [relative, source] of Object.entries(portableFiles)) {
      const absolute = path.join(portable, relative)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, `${source}\n`)
    }

    process.chdir(portable)
    const portableEslint = new ESLint({
      cwd: portable,
      overrideConfigFile: path.join(portable, 'eslint.config.mjs'),
    })
    const portableResults = await portableEslint.lintFiles(['product'])
    process.chdir(nestedCwd)
    const portableBad = portableResults.find((result) =>
      result.filePath.endsWith(path.join('product', 'routes', 'bad', 'page.ts'))
    )
    if (
      !portableBad?.messages.some(
        (message) =>
          message.ruleId === 'clean-architecture/boundaries' && message.messageId === 'appInternal'
      ) ||
      portableBad.messages.some((message) => message.ruleId === 'import/no-unresolved')
    ) {
      errors.push(
        `portable roots/alias canary failed: ${portableBad?.messages
          .map((message) => `${message.ruleId}:${message.messageId ?? message.message}`)
          .join(', ')}`
      )
    }

    const portableGraph = spawnSync(
      process.execPath,
      [path.join(portable, 'rules', path.basename(CYCLES))],
      { cwd: path.join(portable, 'product', 'routes'), encoding: 'utf8' }
    )
    const portableGraphOutput = `${portableGraph.stdout}${portableGraph.stderr}`
    if (
      portableGraph.status === 0 ||
      !portableGraphOutput.includes('cycle-a -> cycle-b -> cycle-a')
    ) {
      errors.push(
        `portable cycle alias canary failed: ${portableGraphOutput.trim() || `exit ${portableGraph.status}`}`
      )
    }

    sandboxSummary = `${clean.size} clean fixtures, ${expectedBase.size} boundary mutations, ${expectedStrict.size + 8} resolver/cycle/portability canaries`
  } finally {
    process.chdir(previousCwd)
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

for (const [generatedRoot, expected] of [
  ['../outside', 'generatedRoot must stay inside the project root'],
  ['generated', 'generatedRoot must stay inside sourceRoot'],
  ['src', 'moduleRoot and generatedRoot must not overlap'],
  ['src/modules', 'moduleRoot and generatedRoot must not overlap'],
  ['src/app/generated', 'appRoot and generatedRoot must not overlap'],
  ['src/shared/generated', 'sharedRoot and generatedRoot must not overlap'],
]) {
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'invalid-generated-root-')))
  try {
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{"private":true,"type":"module"}\n')
    fs.mkdirSync(path.join(sandbox, 'rules'))
    fs.writeFileSync(
      path.join(sandbox, 'rules/architecture-contract.json'),
      `${JSON.stringify({
        ...JSON.parse(fs.readFileSync(path.join(root, CONTRACT), 'utf8')),
        generatedRoot,
      })}\n`
    )
    try {
      loadArchitecturePaths(import.meta.url, sandbox)
      errors.push(`${generatedRoot} was accepted as generatedRoot`)
    } catch (error) {
      if (!String(error.message).includes(expected)) {
        errors.push(`${generatedRoot} failed for the wrong reason: ${error.message}`)
      }
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

// The cycle checker consumes the shared AST extractor directly. Keep its uncommon static module
// forms covered here even when no other checker needs them.
for (const [label, source, expected] of [
  ['template import', "const value = import(`@/modules/a/server`)\n", '@/modules/a/server'],
  ['template require', "const value = require(`@/modules/a/server`)\n", '@/modules/a/server'],
  ['module.require', "const value = module.require('@/modules/a/server')\n", '@/modules/a/server'],
  ['module bracket require', "const value = module['require']('@/modules/a/server')\n", '@/modules/a/server'],
  ['import attributes', "const value = import('@/modules/a/server', { with: { type: 'json' } })\n", '@/modules/a/server'],
]) {
  const parsed = ts.createSourceFile(`${label}.ts`, source, ts.ScriptTarget.Latest, true)
  if (!moduleSpecifiers(parsed).includes(expected)) errors.push(`${label} was not extracted`)
}
{
  const parsed = ts.createSourceFile('ordinary-method.ts', "loader.require('@/not-an-edge')\n", ts.ScriptTarget.Latest, true)
  if (moduleSpecifiers(parsed).length > 0) errors.push('ordinary require method was classified as a module edge')
}

fail(errors)
console.log(`rules ok (${sandboxSummary})`)
