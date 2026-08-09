#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { fail, root } from './_lib.mjs'

const BASE = 'rules/eslint-boundaries.mjs'
const STRICT = 'rules/eslint-boundaries-resolved.mjs'
const CONTRACT = 'rules/architecture-contract.json'
const PATHS = 'rules/contract-paths.mjs'
const CYCLES = 'rules/check-module-cycles.mjs'
const NEUTRAL_CHECK = 'rules/check-neutral-surfaces.mjs'
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
  // The directive is the point, not decoration: `check-neutral-surfaces.mjs` decides the browser
  // side from the effective module graph, and a browser query with no boundary anywhere in the tree
  // is not consumed from the browser. Folder alone used to answer this, which is how a
  // server-renderable `ui/**` view counted as a client consumer.
  'src/modules/work-items/client/query.ts': `
'use client'
import { createWorkItem } from '../actions.js'
import { workItemKeys } from '../query-cache.js'
export const mutation = createWorkItem
export const queryKey = workItemKeys.list()
`,
  // The contract's § Dependency Direction 9 — "Both server and browser paths may import
  // `query-cache.ts`" — is the specific exception to 6's "server/** does not import its own root
  // public surfaces". Clean here, and counted as the server side by the neutral check below: the
  // two shipped checks used to contradict each other on exactly this file.
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
  // without qualification. Erasing type edges in the shared extractor made this graph report none.
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
  // shared resolver happily resolved imports into it. The two halves of the floor disagreed about
  // what the project contains, and the narrower one was the one that judges.
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
    for (const source of [BASE, STRICT, CONTRACT, PATHS, CYCLES, NEUTRAL_CHECK]) {
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

    // ONE tree, judged by both shipped checks. Each had its own fixtures, so when they disagreed
    // about the canonical private-server consumer of a neutral surface — this check counting it as
    // the server side while the boundary rule called the same import a `privateServerBackedge` —
    // nothing noticed, and the advertised green floor was unreachable for a pattern the contract
    // explicitly permits. The sandbox holds deliberately bad neutral surfaces too, so this asserts
    // on the well-formed one by name rather than on the exit code.
    const neutralResult = spawnSync(process.execPath, [path.join(sandbox, path.basename(NEUTRAL_CHECK))], {
      cwd: nestedCwd,
      encoding: 'utf8',
    })
    const neutralOutput = `${neutralResult.stdout}${neutralResult.stderr}`
    if (/work-items\/query-cache\.ts/.test(neutralOutput)) {
      errors.push(
        `the two checks disagree: eslint accepts the work-items neutral surface and its consumers, the neutral check does not — ${neutralOutput.trim().slice(0, 240)}`
      )
    }

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
    // A type-only cycle is still a cycle. The contract requires the module dependency graph to be
    // acyclic without qualification, and the shared extractor's runtime view — right for the
    // neutral check — reported this graph as having no edges at all.
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

    sandboxSummary = `${clean.size} clean fixtures, ${expectedBase.size} boundary mutations, ${expectedStrict.size + 4} resolver/cycle/portability canaries`
  } finally {
    process.chdir(previousCwd)
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

// ─── Admission and neutrality checks, on their own fixture trees ───
// These two are standalone scripts rather than ESLint rules, so the sandbox above cannot exercise
// them: it has no shared root and no neutral surface. Each tree is built to produce ONE verdict, and
// each verdict is asserted in both directions — a check that only ever passes is the failure mode
// this repository exists to remove. The alias is deliberately `~/`, not `@/`: the versions these
// were ported from hardcoded `@/`, so a fixture using the conventional alias would have proved
// nothing about portability.
let floorAssertions = 0
const ADMISSION = 'rules/check-shared-admission.mjs'
const NEUTRAL = 'rules/check-neutral-surfaces.mjs'

function buildTree(files, contract) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'floor-'))
  fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true,"type":"module"}\n')
  fs.mkdirSync(path.join(dir, 'rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'rules/architecture-contract.json'), `${JSON.stringify(contract, null, 2)}\n`)
  for (const [relative, body] of Object.entries(files)) {
    const absolute = path.join(dir, relative)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, body)
  }
  return dir
}

const FLOOR_CONTRACT = {
  sourceRoot: 'src',
  moduleRoot: 'src/modules',
  appRoot: 'src/app',
  sharedRoot: 'src/shared',
  importAliases: { '~/': 'src/' },
  segments: ['domain', 'application', 'server', 'client', 'ui'],
  publicSurfaces: ['server', 'rsc', 'actions', 'client', 'query-cache'],
  serverSurfaces: ['server', 'rsc'],
  clientSurfaces: ['client', 'ui'],
  neutralSurfaces: ['query-cache'],
  sharedRoots: ['kernel'],
}

const runCheck = (script, dir) =>
  spawnSync(process.execPath, [path.join(root, script), dir], { encoding: 'utf8' })

function expectCheck(script, label, files, contract, wantStatus, wantText) {
  floorAssertions += 1
  const dir = buildTree(files, contract)
  try {
    const result = runCheck(script, dir)
    const output = `${result.stdout}${result.stderr}`
    if (result.status !== wantStatus) {
      errors.push(`${script} (${label}): expected exit ${wantStatus}, got ${result.status} — ${output.trim().slice(0, 200)}`)
    } else if (wantText && !output.includes(wantText)) {
      errors.push(`${script} (${label}): expected output to mention "${wantText}", got ${output.trim().slice(0, 200)}`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const twoConsumers = {
  'src/shared/kernel/money.ts': 'export const money = 1\n',
  'src/modules/orders/server/a.ts': "import { money } from '~/shared/kernel/money'\nexport const a = money\n",
  'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
}
expectCheck(ADMISSION, 'two capabilities admit it', twoConsumers, FLOOR_CONTRACT, 0, 'shared admission ok')
expectCheck(
  ADMISSION,
  'no importer at all',
  { ...twoConsumers, 'src/shared/kernel/ghost.ts': 'export const ghost = 1\n' },
  FLOOR_CONTRACT,
  1,
  'has no importer at all'
)
expectCheck(
  ADMISSION,
  'one capability owns it',
  {
    ...twoConsumers,
    'src/shared/kernel/solo.ts': 'export const solo = 1\n',
    'src/modules/orders/server/c.ts': "import { solo } from '~/shared/kernel/solo'\nexport const c = solo\n",
  },
  FLOOR_CONTRACT,
  1,
  'that is its natural owner'
)
// The ratchet must tighten as well as hold: an improvement that leaves the budget untouched would
// let the next regression slip back under it unnoticed.
expectCheck(
  ADMISSION,
  'budget is now generous',
  twoConsumers,
  { ...FLOOR_CONTRACT, sharedAdmissionBudget: { unused: 2, demote: 2, speculative: 2 } },
  1,
  'Lower `sharedAdmissionBudget`'
)
// A test importing a helper is not a consumer: a file kept alive only by its own test is dead code
// with a test attached.
expectCheck(
  ADMISSION,
  'a test is not a consumer',
  {
    ...twoConsumers,
    'src/shared/kernel/tested.ts': 'export const tested = 1\n',
    'src/shared/kernel/__tests__/tested.test.ts': "import { tested } from '~/shared/kernel/tested'\nexport const t = tested\n",
  },
  FLOOR_CONTRACT,
  1,
  'has no importer at all'
)

// A pre-migration tree is mostly files the contract cannot place, and that is this check's audience.
// Answering 'app' for them made two files in src/lib look like a legitimate consumer set and reported
// a shared helper "admitted" on the evidence of nothing.
expectCheck(
  ADMISSION,
  'importers the contract cannot name',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/lib/a.ts': "import { money } from '~/shared/kernel/money'\nexport const a = money\n",
    'src/lib/b.ts': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  1,
  'could not be judged'
)
// A repository that has not migrated yet records the count deliberately, the way it records every
// other kind of debt — the ratchet is how "we know, and it may not grow" is expressed.
expectCheck(
  ADMISSION,
  'a recorded unattributable budget is how a pre-migration tree passes',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/lib/a.ts': "import { money } from '~/shared/kernel/money'\nexport const a = money\n",
  },
  { ...FLOOR_CONTRACT, sharedAdmissionBudget: { unattributable: 1 } },
  0,
  '1 unattributable'
)
// And it must not swallow the real verdicts: a genuine two-capability consumer set still reads as
// admitted, with nothing unattributable.
expectCheck(ADMISSION, 'named owners are still admitted', twoConsumers, FLOOR_CONTRACT, 0, '1 admitted, 0 private, 0 unattributable')

// The verdict `unused` prints as "delete it", so an importer the scan cannot open is advice to
// delete live code. Restricting the scan to .ts/.tsx did exactly that to two working .js consumers.
expectCheck(
  ADMISSION,
  'JavaScript importers are importers',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/modules/orders/server/a.js': "import { money } from '~/shared/kernel/money'\nexport const a = money\n",
    'src/modules/billing/server/b.js': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  0,
  '1 admitted'
)
expectCheck(
  ADMISSION,
  'require() is an import',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/modules/orders/server/a.cjs': "const { money } = require('~/shared/kernel/money')\nmodule.exports = money\n",
    'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  0,
  '1 admitted'
)
// The rule counts OWNERS. Two routes under one `app` owner are one consumer, however many files.
expectCheck(
  ADMISSION,
  'two files under one owner are one consumer',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/app/one/page.tsx': "import { money } from '~/shared/kernel/money'\nexport const a = money\n",
    'src/app/two/page.tsx': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  1,
  'admission counts capability consumers, and it has none'
)

// One resolver, shared. The admission check used to know about directory `index` files but not about
// `./x.js` meaning `x.ts`; an import it cannot resolve is an import it does not count, and a shared
// file with no counted importer is reported `unused` — advice to delete live code.
expectCheck(
  ADMISSION,
  'an emitted-extension specifier still counts as an importer',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/modules/orders/server/a.ts': "import { money } from '~/shared/kernel/money.js'\nexport const a = money\n",
    'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money.js'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  0,
  '1 admitted'
)
// And the other half of what the two used to know separately: a directory import.
expectCheck(
  ADMISSION,
  'a directory import still counts as an importer',
  {
    'src/shared/kernel/money/index.ts': 'export const money = 1\n',
    'src/modules/orders/server/a.ts': "import { money } from '~/shared/kernel/money'\nexport const a = money\n",
    'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  0,
  '1 admitted'
)

// The substitution is per emitted extension. One shared candidate list resolved `./x.mjs` to `x.ts`
// — a file TypeScript would never have picked — and knew nothing about declaration files at all, so
// an import that resolves in the compiler resolved to nothing here and its target read as unused.
// Both candidates exist, so the fixture can only pass if the RIGHT one was chosen: the old shared
// list tried `.ts` first and would have named the other file as the orphan.
for (const [emitted, source] of [['.mjs', '.mts'], ['.cjs', '.cts']]) {
  expectCheck(
    ADMISSION,
    `a '${emitted}' specifier resolves to '${source}', not to '.ts'`,
    {
      'src/shared/kernel/money.ts': 'export const money = 1\n',
      [`src/shared/kernel/money${source}`]: 'export const money = 1\n',
      'src/modules/orders/server/a.ts': `import { money } from '~/shared/kernel/money${emitted}'\nexport const a = money\n`,
      'src/modules/billing/server/b.ts': `import { money } from '~/shared/kernel/money${emitted}'\nexport const b = money\n`,
    },
    FLOOR_CONTRACT,
    1,
    'money.ts has no importer'
  )
}
// A declaration file was not a candidate at all, so an import that resolves in the compiler
// resolved to nothing here and its target read as unused — advice to delete live code.
expectCheck(
  ADMISSION,
  "a '.js' specifier resolves to a declaration file",
  {
    'src/shared/kernel/money.d.ts': 'export declare const money: number\n',
    'src/modules/orders/server/a.ts': "import { money } from '~/shared/kernel/money.js'\nexport const a = money\n",
    'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money.js'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  0,
  '1 admitted'
)
// A NodeNext-extension file is a source file. The ESLint glob said otherwise while the resolver
// said it was, so the two halves of the floor disagreed about what the project contains.
expectCheck(
  ADMISSION,
  'an .mts importer is visible to the admission scan',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/modules/orders/server/a.mts': "import { money } from '~/shared/kernel/money.js'\nexport const a = money\n",
    'src/modules/billing/server/b.cts': "import { money } from '~/shared/kernel/money.js'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  0,
  '1 admitted'
)

// ─── one extension inventory, or the check disagrees with itself ───
// Each list in the script was written out by hand and they drifted apart. Every drift is the same
// defect: a file the check does not recognise as what it is gets judged as something else, and the
// judgement is advice to delete or move live code.
const admitted = {
  'src/shared/kernel/money.ts': 'export const money = 1\n',
  'src/modules/orders/server/a.ts': "import { money } from '~/shared/kernel/money'\nexport const a = money\n",
}
// Root wiring is scanned for LIVENESS, not for ownership: it keeps a live file out of `unused`,
// whose advice is "delete it", but the contract's threshold is "at least two real capability
// consumers" and repository-root wiring is not one. The earlier fixture pinned the opposite and so
// defended the check's disagreement with its own normative source.
expectCheck(
  ADMISSION,
  'repository-root wiring keeps a file alive without owning it',
  { ...admitted, 'instrumentation.js': "import { money } from '~/shared/kernel/money'\nexport const wired = money\n" },
  FLOOR_CONTRACT,
  1,
  'imported by one capability ("orders") and by non-capability code ("root")'
)
// And the liveness half, in the same shape: it must never read as having no importer at all.
expectCheck(
  ADMISSION,
  'root wiring is still an importer',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'instrumentation.js': "import { money } from '~/shared/kernel/money'\nexport const wired = money\n",
  },
  FLOOR_CONTRACT,
  1,
  'imported only by non-capability code ("root")'
)
expectCheck(
  ADMISSION,
  'a .test.js is a test, not a second owner',
  { ...admitted, 'src/modules/billing/server/b.test.js': "import { money } from '~/shared/kernel/money'\nexport const b = money\n" },
  FLOOR_CONTRACT,
  1,
  'is used only by the "orders" capability'
)
expectCheck(
  ADMISSION,
  'a .stories.js is a story, not a deletable file',
  {
    ...admitted,
    'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
    'src/shared/kernel/button.stories.js': "export const Default = () => null\n",
  },
  FLOOR_CONTRACT,
  0,
  '1 admitted'
)

// Tests, mocks and stories were treated three different ways: tests skipped in both directions,
// `__mocks__` skipped nowhere, stories skipped as subjects but still counted as importers. None of
// them ships, and the rule they were feeding is "at least two real capabilities".
for (const [label, file] of [
  ['a mock directory is not a second owner', 'src/modules/billing/__mocks__/money.ts'],
  ['a mock suffix is not a second owner', 'src/modules/billing/server/b.mock.ts'],
  ['a module-local test directory is not a second owner', 'src/modules/billing/server/test/b.ts'],
  ['a module-local tests directory is not a second owner', 'src/modules/billing/tests/b.ts'],
  ['a story is not a second owner', 'src/modules/billing/server/b.stories.tsx'],
]) {
  expectCheck(
    ADMISSION,
    label,
    { ...admitted, [file]: "import { money } from '~/shared/kernel/money'\nexport const b = money\n" },
    FLOOR_CONTRACT,
    1,
    'is used only by the "orders" capability'
  )
}

// ─── an owner the contract cannot name decides nothing ───
// An unadmitted shared root is the shape `invalidSharedRoot` exists to reject, and it was counting
// towards the two-owner threshold.
// The importer is exempted as a SUBJECT so the fixture asks one question: whether it counts as an
// OWNER of the file it imports.
expectCheck(
  ADMISSION,
  'an importer under an unadmitted shared root is not an owner',
  { ...admitted, 'src/shared/utils/date.ts': "import { money } from '~/shared/kernel/money'\nexport const d = money\n" },
  {
    ...FLOOR_CONTRACT,
    sharedAdmissionExempt: { 'src/shared/utils/date.ts': 'the subject of a different question in this fixture' },
  },
  1,
  'could not be judged'
)
expectCheck(
  ADMISSION,
  'one capability plus one unattributable importer is not a demote',
  { ...admitted, 'src/legacy/wire.ts': "import { money } from '~/shared/kernel/money'\nexport const w = money\n" },
  FLOOR_CONTRACT,
  1,
  'could not be judged'
)
// A capability is a DIRECTORY under moduleRoot. A file sitting directly there was answered with its
// own filename, and that string counted as a second owner.
expectCheck(
  ADMISSION,
  'a file directly under moduleRoot is not a capability',
  { ...admitted, 'src/modules/index.ts': "import { money } from '~/shared/kernel/money'\nexport const all = money\n" },
  FLOOR_CONTRACT,
  1,
  'could not be judged'
)

// Every static module-loading form is an edge, and a form the extractor cannot see is an importer
// that does not exist — which this check prints as "delete it". Three private extractors disagreed
// about which forms count; there is one now, and each form has a fixture.
for (const [label, importer] of [
  ['a no-substitution template in import()', "const m = import(`~/shared/kernel/money`)\nexport const a = m\n"],
  ['a no-substitution template in require()', "const m = require(`~/shared/kernel/money`)\nmodule.exports = m\n"],
  ['module.require', "const m = module.require('~/shared/kernel/money')\nmodule.exports = m\n"],
  ["module['require']", "const m = module['require']('~/shared/kernel/money')\nmodule.exports = m\n"],
  ['import() with options', "const m = import('~/shared/kernel/money', { with: { type: 'json' } })\nexport const a = m\n"],
  ['a bare side-effect named-import list', "import {} from '~/shared/kernel/money'\nexport const a = 1\n"],
  ['a bare side-effect named re-export', "export {} from '~/shared/kernel/money'\n"],
  // The whole point of the runtime/type split: erasing this edge told a live types file to delete
  // itself. Admission counts consumers, and a type consumer is a consumer.
  ['a type-only import', "import type { Money } from '~/shared/kernel/money'\nexport type A = Money\n"],
]) {
  expectCheck(
    ADMISSION,
    `${label} is an importer`,
    {
      'src/shared/kernel/money.ts': 'export const money = 1\nexport type Money = number\n',
      'src/modules/orders/server/a.ts': importer,
      'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
    },
    FLOOR_CONTRACT,
    0,
    '1 admitted'
  )
}

// The negative half: an ordinary method that happens to be called `require` is not a module edge.
// Accepting any property access named `require` read `loader.require(name)` as an import.
expectCheck(
  ADMISSION,
  'an unrelated .require() method call is not an importer',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/modules/orders/server/a.ts': "declare const loader: { require(name: string): unknown }\nexport const a = loader.require('~/shared/kernel/money')\n",
    'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  1,
  'is used only by the "billing" capability'
)

// `import x = require()` is claimed by this check and was covered by no fixture: removing the branch
// left the whole suite green.
expectCheck(
  ADMISSION,
  'an import-equals importer is an importer',
  {
    'src/shared/kernel/money.ts': 'export const money = 1\n',
    'src/modules/orders/server/a.ts': "import money = require('~/shared/kernel/money')\nexport const a = money\n",
    'src/modules/billing/server/b.ts': "import { money } from '~/shared/kernel/money'\nexport const b = money\n",
  },
  FLOOR_CONTRACT,
  0,
  '1 admitted'
)

// An exemption is a claim that the rule cannot apply, and the failure message has always demanded a
// reason for it — while the value was read as a bare list of paths, so there was nowhere to put one.
{
  const orphan = {
    'src/shared/kernel/env.ts': 'export const env = 1\n',
    'src/modules/orders/server/a.ts': "export const a = 1\n",
  }
  expectCheck(
    ADMISSION,
    'an exemption carries its reason',
    orphan,
    { ...FLOOR_CONTRACT, sharedAdmissionExempt: { 'src/shared/kernel/env.ts': 'read by the build, never imported' } },
    0,
    'admitted'
  )
  expectCheck(
    ADMISSION,
    'an exemption with no reason fails',
    orphan,
    { ...FLOOR_CONTRACT, sharedAdmissionExempt: { 'src/shared/kernel/env.ts': '  ' } },
    1,
    'is exempt with no reason recorded'
  )
  // A contract written against the old shape still runs — and is told exactly what is missing,
  // rather than being silently honoured as if a reason had been given.
  expectCheck(
    ADMISSION,
    'a bare list of exempt paths is reported as reasonless',
    orphan,
    { ...FLOOR_CONTRACT, sharedAdmissionExempt: ['src/shared/kernel/env.ts'] },
    1,
    'is exempt with no reason recorded'
  )
}

// Absent `generatedRoot` must mean "this project generates nothing", not "unchecked". The shipped
// contract omits it, so this is the shape every adopter starts from.
{
  const dir = buildTree(
    {
      'src/generated/rows.ts': 'export type Row = { id: string }\n',
      'src/modules/orders/domain/thing.ts': "import type { Row } from '~/generated/rows'\nexport const idOf = (r: Row) => r.id\n",
    },
    FLOOR_CONTRACT
  )
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'node_modules/.bin/eslint'), '--no-config-lookup', '--config', path.join(root, 'rules/eslint-boundaries.mjs'), '.'],
      { cwd: dir, encoding: 'utf8' }
    )
    floorAssertions += 1
    if (/generatedProviderLeak/.test(`${result.stdout}${result.stderr}`)) {
      errors.push('generatedProviderLeak fired with no generatedRoot declared — absent must mean inert, not unchecked')
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const bothSides = {
  'src/modules/orders/query-cache.ts': "export const key = ['orders']\n",
  'src/modules/orders/rsc.ts': "import { key } from '~/modules/orders/query-cache'\nexport const rsc = key\n",
  'src/modules/orders/client/hook.ts': "'use client'\nimport { key } from '~/modules/orders/query-cache'\nexport const useOrders = () => key\n",
}
expectCheck(NEUTRAL, 'both runtimes consume it', bothSides, FLOOR_CONTRACT, 0, 'neutral surfaces ok')
const { 'src/modules/orders/client/hook.ts': _clientSide, ...serverOnly } = bothSides
expectCheck(NEUTRAL, 'server side only', serverOnly, FLOOR_CONTRACT, 1, 'found server')
const { 'src/modules/orders/rsc.ts': _serverSide, ...clientOnly } = bothSides
expectCheck(NEUTRAL, 'client side only', clientOnly, FLOOR_CONTRACT, 1, 'found client')
// A route handler reading the surface is using it as a server module, not prefetching into a
// hydrated cache — so it must not count as the second side.
expectCheck(
  NEUTRAL,
  'a route handler is not the server side',
  {
    ...clientOnly,
    'src/app/orders/route.ts': "import { key } from '~/modules/orders/query-cache'\nexport const GET = () => key\n",
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)

// ─── which runtime a consumer is on is a graph question ───
// Six verdicts the folder-and-directive version got wrong, each reproduced here in the direction it
// failed. Three were false PASSES — the worst kind, because the surface stays and the next reader
// believes a check confirmed it — and three were false failures, which cost a real design its
// legitimacy. `~/` aliases throughout, as above, so none of this leans on the conventional `@/`.
const importsKey = (from) => `import { key } from '${from}'\n`

// FALSE PASS 1: `ui/**` was read as client by folder. A server-rendered view plus the RSC surface
// is two server consumers, and the surface has no browser side at all.
expectCheck(
  NEUTRAL,
  'a server-renderable ui view is not the client side',
  {
    ...serverOnly,
    'src/modules/orders/ui/list.tsx': `${importsKey('~/modules/orders/query-cache')}export const List = () => key\n`,
  },
  FLOOR_CONTRACT,
  1,
  'found server'
)

// FALSE PASS 2: a test importing the surface counted as a runtime consumer. It ships on neither.
expectCheck(
  NEUTRAL,
  'a client test is not a client consumer',
  {
    ...serverOnly,
    'src/modules/orders/client/hook.test.ts': `'use client'\n${importsKey('~/modules/orders/query-cache')}export const t = key\n`,
  },
  FLOOR_CONTRACT,
  1,
  'found server'
)

// FALSE PASS 3: a type-only import is erased before any module graph exists.
expectCheck(
  NEUTRAL,
  'a type-only import is not a runtime consumer',
  {
    ...serverOnly,
    'src/modules/orders/client/types.ts': "'use client'\nimport type { Key } from '~/modules/orders/query-cache'\nexport type K = Key\n",
    'src/modules/orders/query-cache.ts': "export type Key = string[]\nexport const key = ['orders']\n",
  },
  FLOOR_CONTRACT,
  1,
  'found server'
)

// FALSE PASS 4: `'use client'` is a directive only in the prologue. Further down it is a string.
expectCheck(
  NEUTRAL,
  'a non-prologue use client string is not a boundary',
  {
    ...serverOnly,
    'src/modules/orders/client/hook.ts': `${importsKey('~/modules/orders/query-cache')}'use client'\nexport const useOrders = () => key\n`,
  },
  FLOOR_CONTRACT,
  1,
  'found server'
)

// FALSE FAILURE 1: the private server segment is where prefetch lives — the canonical server side.
// `server/**` is where prefetch LIVES; it is not where the server graph STARTS. The composition
// entrypoint that reaches it is what makes it a prefetch site.
const privatePrefetch = {
  'src/modules/orders/query-cache.ts': "export const key = ['orders']\n",
  'src/modules/orders/server/prefetch.ts': `${importsKey('~/modules/orders/query-cache')}export const prefetch = () => key\n`,
  'src/modules/orders/client/hook.ts': `'use client'\n${importsKey('~/modules/orders/query-cache')}export const useOrders = () => key\n`,
}
expectCheck(
  NEUTRAL,
  'a private server prefetch reached from a page is the server side',
  {
    ...privatePrefetch,
    'src/app/orders/page.tsx': "import { prefetch } from '~/modules/orders/server/prefetch'\nexport default prefetch\n",
  },
  FLOOR_CONTRACT,
  0,
  'neutral surfaces ok'
)
// Unreachable, it prefetches for nobody — and seeded as a root it used to say otherwise.
expectCheck(
  NEUTRAL,
  'an unreachable private server file is not a prefetch site',
  privatePrefetch,
  FLOOR_CONTRACT,
  1,
  'found client'
)
// Reached only through an action, it is on the action's channel, not the prefetch path.
expectCheck(
  NEUTRAL,
  'a private server helper reached only from an action is not a prefetch site',
  {
    ...privatePrefetch,
    'src/modules/orders/actions.ts': "'use server'\nimport { prefetch } from '~/modules/orders/server/prefetch'\nexport const act = async () => prefetch()\n",
    'src/app/orders/page.tsx': "import { act } from '~/modules/orders/actions'\nexport default act\n",
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)

// FALSE FAILURE 2: `export { key } from '...'` is an edge. Ignoring it hid a real consumer.
expectCheck(
  NEUTRAL,
  'a named re-export is a consumer',
  {
    ...serverOnly,
    'src/modules/orders/client/keys.ts': "'use client'\nexport { key } from '~/modules/orders/query-cache'\n",
  },
  FLOOR_CONTRACT,
  0,
  'neutral surfaces ok'
)

// FALSE FAILURE: a file can be on BOTH sides, and answering with one let client win. A view a page
// renders and a Client Component also imports is in both graphs; reported as browser-only, the
// surface it consumes was declared to have no server side.
expectCheck(
  NEUTRAL,
  'a consumer reached from both a page and a client boundary contributes both sides',
  {
    'src/modules/orders/query-cache.ts': "export const key = ['orders']\n",
    'src/modules/orders/ui/list.tsx': `${importsKey('~/modules/orders/query-cache')}export const List = () => key\n`,
    'src/app/orders/page.tsx': "import { List } from '~/modules/orders/ui/list'\nexport default List\n",
    'src/modules/orders/client/hook.tsx': "'use client'\nimport { List } from '~/modules/orders/ui/list'\nexport const H = () => List()\n",
  },
  FLOOR_CONTRACT,
  0,
  'neutral surfaces ok'
)

// FALSE FAILURES: edge forms the graph did not see. The check scans `.cjs`/`.cts`, so it has to
// read the syntax those files are written in, and `export *` is as real an edge as a named one.
for (const [label, file, body] of [
  [
    'a require() client consumer is a consumer',
    'src/modules/orders/client/hook.cjs',
    "'use client'\nconst { key } = require('~/modules/orders/query-cache')\nmodule.exports = key\n",
  ],
  [
    'an import-equals client consumer is a consumer',
    'src/modules/orders/client/hook.cts',
    "'use client'\nimport keys = require('~/modules/orders/query-cache')\nexport const k = keys\n",
  ],
  [
    'export * is an edge',
    'src/modules/orders/client/all.ts',
    "'use client'\nexport * from '~/modules/orders/query-cache'\n",
  ],
]) {
  expectCheck(NEUTRAL, label, { ...serverOnly, [file]: body }, FLOOR_CONTRACT, 0, 'neutral surfaces ok')
}

// FALSE PASSES: artifacts that ship on no runtime, and a channel identified by its directive. Each
// is added to the tree that is missing the OTHER side, so inventing a side is the only way to pass.
expectCheck(
  NEUTRAL,
  'a client story is not a client consumer',
  {
    ...serverOnly,
    'src/modules/orders/client/hook.stories.tsx': `'use client'\n${importsKey('~/modules/orders/query-cache')}export const Default = () => key\n`,
  },
  FLOOR_CONTRACT,
  1,
  'found server'
)
expectCheck(
  NEUTRAL,
  'a declaration file is not a runtime consumer',
  {
    ...clientOnly,
    'src/app/orders/keys.d.ts': "import { key } from '~/modules/orders/query-cache'\nexport declare const k: typeof key\n",
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)
// An action module is its own channel whatever it is called; the directive is what makes it one.
expectCheck(
  NEUTRAL,
  "an app file with a 'use server' prologue is not route composition",
  {
    ...clientOnly,
    'src/app/orders/mutate.ts': `'use server'\n${importsKey('~/modules/orders/query-cache')}export const m = async () => key\n`,
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)

// ─── the runtimes do not flow into each other ───
// Unbounded traversal is the import graph, not the effective one. Each case below invented a side
// out of an edge no build follows, and each passed as cross-runtime.
expectCheck(
  NEUTRAL,
  "a 'use client' page is not a server root",
  {
    ...clientOnly,
    'src/app/orders/page.tsx': `'use client'\n${importsKey('~/modules/orders/query-cache')}export default () => key\n`,
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)
expectCheck(
  NEUTRAL,
  'a page rendering a Client Component does not put it on the server',
  {
    'src/modules/orders/query-cache.ts': "export const key = ['orders']\n",
    'src/modules/orders/client/hook.tsx': `'use client'\n${importsKey('~/modules/orders/query-cache')}export const H = () => key\n`,
    'src/app/orders/page.tsx': "import { H } from '~/modules/orders/client/hook'\nexport default H\n",
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)
expectCheck(
  NEUTRAL,
  "a route handler's own helper is not composition",
  {
    ...clientOnly,
    'src/app/orders/helpers.ts': `${importsKey('~/modules/orders/query-cache')}export const h = () => key\n`,
    'src/app/orders/route.ts': "import { h } from './helpers'\nexport const GET = h\n",
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)
expectCheck(
  NEUTRAL,
  'a Client Component importing a Server Action does not make the action browser code',
  {
    ...serverOnly,
    'src/modules/orders/actions.ts': `'use server'\n${importsKey('~/modules/orders/query-cache')}export const act = async () => key\n`,
    'src/modules/orders/client/hook.tsx': "'use client'\nimport { act } from '~/modules/orders/actions'\nexport const H = () => act\n",
  },
  FLOOR_CONTRACT,
  1,
  'found server'
)
expectCheck(
  NEUTRAL,
  'a type-only import-equals is not a runtime consumer',
  {
    ...serverOnly,
    'src/modules/orders/client/types.cts': "'use client'\nimport type keys = require('~/modules/orders/query-cache')\nexport type K = typeof keys\n",
  },
  FLOOR_CONTRACT,
  1,
  'found server'
)

// ─── every App Router composition entrypoint seeds the server graph ───
// The inventory was a remembered subset: `forbidden`, `unauthorized` and `global-not-found` are
// current Next.js UI conventions and were missing, so a surface legitimately prefetched from one of
// them reported no server side. One row per convention, because deleting all but `page` left every
// verdict green.
for (const entrypoint of [
  'page', 'layout', 'template', 'default', 'loading', 'error', 'global-error',
  'not-found', 'global-not-found', 'forbidden', 'unauthorized',
]) {
  expectCheck(
    NEUTRAL,
    `${entrypoint}.tsx is a server consumer`,
    {
      ...clientOnly,
      [`src/app/orders/${entrypoint}.tsx`]: `${importsKey('~/modules/orders/query-cache')}export default () => key\n`,
    },
    FLOOR_CONTRACT,
    0,
    'neutral surfaces ok'
  )
}
// `pageExtensions` lets a project spell a convention `page.page.tsx`; stripping only the final
// extension left `page.page`, a name no inventory can contain.
expectCheck(
  NEUTRAL,
  'a configured pageExtensions spelling is still a page',
  {
    ...clientOnly,
    'src/app/orders/page.page.tsx': `${importsKey('~/modules/orders/query-cache')}export default () => key\n`,
  },
  { ...FLOOR_CONTRACT, pageExtensions: ['page.tsx', 'ts', 'tsx'] },
  0,
  'neutral surfaces ok'
)
// A helper NAMED after a convention is not that convention. Matching the first dot-segment made
// `page.helper.ts` a composition entrypoint on its own, and `route.helper.ts` a channel of its own —
// one inventing a server side, the other cutting a real one.
expectCheck(
  NEUTRAL,
  'a page.helper.ts is a helper, not a composition entrypoint',
  {
    ...clientOnly,
    'src/app/orders/page.helper.ts': `${importsKey('~/modules/orders/query-cache')}export const h = () => key\n`,
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)
expectCheck(
  NEUTRAL,
  'a route.helper.ts reached from a page is on the prefetch path',
  {
    ...clientOnly,
    'src/app/orders/route.helper.ts': `${importsKey('~/modules/orders/query-cache')}export const h = () => key\n`,
    'src/app/orders/page.tsx': "import { h } from './route.helper'\nexport default h\n",
  },
  FLOOR_CONTRACT,
  0,
  'neutral surfaces ok'
)
// And the barrier the server graph was missing: an action is its own channel in both directions.
expectCheck(
  NEUTRAL,
  'a page calling a Server Action does not prefetch through it',
  {
    ...clientOnly,
    'src/modules/orders/actions.ts': `'use server'\n${importsKey('~/modules/orders/query-cache')}export const act = async () => key\n`,
    'src/app/orders/page.tsx': "import { act } from '~/modules/orders/actions'\nexport default act\n",
  },
  FLOOR_CONTRACT,
  1,
  'found client'
)
// A mock is not a browser consumer either — the predicate is shared with shared admission now.
expectCheck(
  NEUTRAL,
  'a client mock is not a client consumer',
  {
    ...serverOnly,
    'src/modules/orders/client/hook.mock.ts': `'use client'\n${importsKey('~/modules/orders/query-cache')}export const m = key\n`,
  },
  FLOOR_CONTRACT,
  1,
  'found server'
)

// FALSE FAILURE 3: a helper with no directive of its own that only Client Components import IS in
// the client bundle — Next.js decides that by the graph, and so must this. The helper deliberately
// sits in `domain/`, the one segment whose folder says nothing about runtime: in a client folder
// the old check reached the same verdict for the wrong reason, and a fixture that passes either way
// proves nothing.
expectCheck(
  NEUTRAL,
  'a helper reached only from a client boundary is client',
  {
    ...serverOnly,
    'src/modules/orders/client/hook.tsx': "'use client'\nimport { label } from '~/modules/orders/domain/label'\nexport const H = () => label()\n",
    'src/modules/orders/domain/label.ts': `${importsKey('~/modules/orders/query-cache')}export const label = () => key.join('/')\n`,
  },
  FLOOR_CONTRACT,
  0,
  'neutral surfaces ok'
)

fail(errors)
console.log(`rules ok (${sandboxSummary}, ${floorAssertions} admission/neutrality verdicts)`)
