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
  'src/modules/work-items/client/query.ts': `
import { createWorkItem } from '../actions.js'
import { workItemKeys } from '../query-cache.js'
export const mutation = createWorkItem
export const queryKey = workItemKeys.list()
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
])

const expectedStrict = new Map([
  ['src/app/unresolved/page.ts', 'import/no-unresolved'],
  ['src/modules/cycle-a/server.ts', 'import/no-cycle'],
  ['src/modules/cycle-b/server.ts', 'import/no-cycle'],
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

    const parser = `import parser from '@typescript-eslint/parser'\nconst ts = { files: ['src/**/*.{ts,tsx}'], languageOptions: { parser } }\n`
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
  publicSurfaces: ['server', 'rsc', 'client', 'query-cache'],
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

fail(errors)
console.log(`rules ok (${sandboxSummary}, ${floorAssertions} admission/neutrality verdicts)`)
