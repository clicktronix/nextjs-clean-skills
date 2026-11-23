#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

import { fail, root } from './_lib.mjs'
import { loadArchitecturePaths, moduleEdges, moduleSpecifiers, resolveEdgeTargets } from '../rules/contract-paths.mjs'

const BASE = 'rules/eslint-boundaries.mjs'
const STRICT = 'rules/eslint-boundaries-resolved.mjs'
const CONTRACT = 'rules/architecture-contract.json'
const PATHS = 'rules/contract-paths.mjs'
const KEYS = 'rules/contract-keys.mjs'
const CYCLES = 'rules/check-module-cycles.mjs'
const CENSUS = 'rules/census-scope.mjs'
const SEVERITY = { warn: 1, error: 2 }
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
import 'server-only'
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
import 'server-only'
export { getWorkItems } from './server/store.js'
export type { WorkItem } from './domain/model.js'
`,
  'src/modules/work-items/rsc.ts': `
import 'server-only'
import { getWorkItems } from './server.js'
import { workItemKeys } from './query-cache.js'
export const workItemsRscQueryKey = workItemKeys.list()
export async function readWorkItems() {
  return getWorkItems()
}
export { ServerList } from './server/views/server-list.js'
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
import 'client-only'
export { mutation } from './client/query.js'
`,
  'src/modules/work-items/ui/view.ts': `
'use client'
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
import 'server-only'
export { loadLabels } from './server/adapters.js'
`,
  // The orchestrator shape the contract admits: a sibling's public server contract taken as a
  // type from application code. Type-only, public, cross-capability — every rule lets it through.
  'src/modules/board/application/ports.ts': `
import type { listLabels } from '../../labels/server.js'
export type BoardReaders = { labels: { list: typeof listLabels } }
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
  // The compiler constraint the docs promised: a top-level 'use server' module exposes async
  // functions and nothing else. Each fixture escapes one half of the old re-export-only check.
  'src/modules/bad-action-directive/actions.ts': `
export async function createLabel() {
  return { ok: true }
}
`,
  // The string is after an import, so it is an expression the compiler ignores, not a directive.
  'src/modules/bad-action-late-directive/actions.ts': `
import type { WorkItem } from '../work-items/server.js'
'use server'
export async function createLabel(): Promise<WorkItem | null> {
  return null
}
`,
  'src/modules/bad-action-sync/actions.ts': `
'use server'
export function createLabel() {
  return { ok: true }
}
`,
  'src/modules/bad-action-local-export/actions.ts': `
'use server'
const limit = 10
export { limit }
`,
  // An imported binding published unchanged is a value re-export written in two statements.
  'src/modules/bad-action-import-reexport/actions.ts': `
'use server'
import { getWorkItems } from '../work-items/server.js'
export { getWorkItems }
export const alias = getWorkItems
export default getWorkItems
`,
  // A negative number and undefined are not functions, and neither is a Literal node.
  'src/modules/bad-action-unary/actions.ts': `
'use server'
export const offset = -1
export const missing = undefined
`,
  // Arithmetic is provably not a function, whatever the wrapper rule admits.
  'src/modules/bad-action-binary/actions.ts': `
'use server'
export const answer = 1 + 2
`,
  // Neither is an enum exported through a local binding.
  'src/modules/bad-action-enum/actions.ts': `
'use server'
enum Status { Pending, Done }
export { Status }
`,
  // An object literal is not a function; Next.js lets it through the build and fails at load.
  'src/modules/bad-action-object/actions.ts': `
'use server'
export const config = { retries: 3 } as const
`,
  // A higher-order wrapper produces the async function at runtime, which is what Next.js checks.
  'src/modules/good-action-wrapped/actions.ts': `
'use server'
type Action<T> = (input: T) => Promise<{ ok: boolean }>
const withAuth = <T,>(action: Action<T>): Action<T> => action
const client = { action: <T,>(action: Action<T>): Action<T> => action }
export const createLabel = withAuth(async (_name: string) => ({ ok: true }))
export const renameLabel = client.action(async (_name: string) => ({ ok: true }))
const archiveLabel = withAuth(async (_id: string) => ({ ok: true }))
export { archiveLabel }
export default withAuth(async (_id: string) => ({ ok: true }))
`,
  // Every accepted shape of an async value export: declaration, const arrow, local export list,
  // type export, and a type-only re-export.
  'src/modules/good-actions/actions.ts': `
'use server'
export type ActionState = { ok: boolean }
export async function createWorkItem(): Promise<ActionState> {
  return { ok: true }
}
export const archiveWorkItem = async (): Promise<ActionState> => ({ ok: true })
async function restoreWorkItem(): Promise<ActionState> {
  return { ok: true }
}
export { restoreWorkItem }
export type { ActionState as State }
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
import 'server-only'
export const graphA = true
`,
  'src/modules/graph-a/server/use-b.ts': `
import { graphB } from '../../graph-b/server.js'
export const useB = graphB
`,
  'src/modules/graph-b/server.ts': `
import 'server-only'
export const graphB = true
`,
  'src/modules/graph-b/server/use-a.ts': `
import { graphA } from '../../graph-a/server.js'
export const useA = graphA
`,

  // A type-only edge is erased by the compiler, so the runtime-direction rules have nothing to
  // report on it; the ownership rules still do, because the coupling survives compilation.
  'src/modules/type-consumer/client/view.ts': `
'use client'
import type { WorkItem } from '../../work-items/server.js'
export type Local = WorkItem
`,
  'src/modules/type-consumer/client/inline-type.ts': `
'use client'
import { type WorkItem } from '../../work-items/server.js'
export type Inline = WorkItem
`,
  'src/modules/type-consumer/client.ts': `
import 'client-only'
export type { WorkItem } from '../work-items/server.js'
`,
  'src/modules/type-consumer/client/bad-value.ts': `
'use client'
import { getWorkItems } from '../../work-items/server.js'
export default getWorkItems
`,
  // The same borrowed internal type written as an import type node, which no import statement shows.
  'src/modules/type-consumer/domain/bad-import-type.ts': `
export type Borrowed = import('../../work-items/domain/model.js').WorkItem
`,
  // An import type node of a server surface from browser code is erased like import type.
  'src/modules/type-consumer/client/import-type.ts': `
'use client'
export type Remote = import('../../work-items/server.js').WorkItem
export type Surface = typeof import('../../work-items/server.js')
`,
  'src/modules/type-consumer/domain/bad-type-internal.ts': `
import type { WorkItem } from '../../work-items/domain/model.js'
export type Borrowed = WorkItem
`,
  'src/app/bad-type-internal/page.ts': `
import type { WorkItem } from '@/modules/work-items/domain/model'
export type PageItem = WorkItem
`,

  // A contract surface publishes types and the schemas that witness them to a neighbour's domain.
  'src/modules/campaign/domain/model.ts': `
export type Campaign = { id: string }
`,
  'src/modules/campaign/contracts.ts': `
import * as v from 'valibot'
export type { Campaign } from './domain/model.js'
export const CampaignSchema = v.object({ id: v.string() })
export const CampaignListSchema = v.array(CampaignSchema)
`,
  'src/modules/agency/domain/policy.ts': `
import type { Campaign } from '../../campaign/contracts.js'
import { CampaignSchema } from '../../campaign/contracts.js'
export const schema = CampaignSchema
export type Owned = Campaign
`,
  // A contract surface may also publish its capability's pure API: a neighbour's domain, a server
  // operation and the browser all take the same price rule from it.
  'src/modules/pricing/domain/price.ts': `
export type Line = { unitCents: number; quantity: number }
export function totalCents(lines: readonly Line[]): number {
  return lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0)
}
`,
  'src/modules/pricing/contracts.ts': `
export type { Line } from './domain/price.js'
export { totalCents } from './domain/price.js'
`,
  'src/modules/checkout/domain/quote.ts': `
import { totalCents, type Line } from '../../pricing/contracts.js'
export const quote = (lines: readonly Line[]) => ({ totalCents: totalCents(lines) })
`,
  // Purity is held by direction, not by reading declarations: a contract surface that imports a
  // runtime package is not a neutral surface.
  'src/modules/billing/contracts.ts': `
import { cookies } from 'next/headers'
export const session = cookies
`,
  // ui/** imports no server code under either directive: a file there is a view that takes props.
  'src/modules/work-items/ui/BadServerReach.tsx': `
import { store } from '../server/store.js'
export const BadServerReach = () => store
`,

  // Static module forms the ImportDeclaration visitor never sees.
  'src/modules/import-equals/domain/bad-internal.ts': `
import store = require('../../work-items/server/store.js')
export default store
`,
  'src/modules/import-equals/domain/bad-module-require.ts': `
const fs = module.require('node:fs')
export default fs
`,

  // A subpath inherits the class of its package. packageRoot returned the scope, so nothing the
  // contract listed matched @scope/pkg/sub.
  'src/modules/work-items/domain/bad-subpath.ts': `
import thing from '@scope/pkg/sub'
export default thing
`,

  // A template literal with no substitutions is a constant written with different quotes.
  'src/modules/work-items/domain/template-import.ts': `
export const load = () => import(\`./model.js\`)
`,
  'src/modules/work-items/server/hidden-template.ts': `
const name = 'store'
export const load = () => import(\`./\${name}.js\`)
`,

  // A Server Component that reads lives in server/**, renders a ui/** view that takes props, and is
  // published by rsc.ts. The view imports no server code, so ui.ts can never publish a file that
  // only a server importer survives.
  'src/modules/work-items/ui/ListView.tsx': `
export const ListView = (props: { items: unknown[] }) => props.items.length
`,
  'src/modules/work-items/server/views/server-list.tsx': `
import { getWorkItems } from '../store.js'
import { ListView } from '../../ui/ListView.js'
export const ServerList = async () => ListView({ items: getWorkItems() })
`,
  'src/modules/work-items/ui/ReadsRsc.tsx': `
import { readWorkItems } from '../rsc.js'
export const ReadsRsc = async () => readWorkItems()
`,
  'src/modules/work-items/ui/Island.tsx': `
'use client'
export const Island = () => null
`,
  // The directive classifies the target too: a view without it is importable from server code, a
  // Client Component is not named by a private server file.
  'src/modules/work-items/server/views/bad-island.tsx': `
import { Island } from '../../ui/Island.js'
export const BadIsland = Island
`,
  'src/modules/work-items/ui/ClientList.tsx': `
'use client'
import { readWorkItems } from '../rsc.js'
export const ClientList = readWorkItems
`,

  // The runtime marker is a build guarantee, and the contract has claimed it without checking it.
  'src/modules/marker/server.ts': `
export const unmarked = true
`,
  'src/modules/marker/client.ts': `
export const unmarkedClient = true
`,
  // Presence is the check: a marker after the imports it guards still poisons the wrong runtime's
  // bundle graph, so this surface is clean.
  'src/modules/marker/rsc.ts': `
import { unmarked } from './server.js'
import 'server-only'
export const afterImports = unmarked
`,
  // A type-only import of the marker is erased before bundling, so it marks nothing.
  'src/modules/marker-type/server.ts': `
import type {} from 'server-only'
export const secret = 's'
`,
  'src/modules/marker-type/client.ts': `
import type {} from 'client-only'
export const browserOnly = true
`,
  // A side-effect import of something else is not the marker.
  'src/modules/marker/job.ts': `
import './server.js'
export const job = true
`,

  // Ownership covers every source file, not only the three roots. A file outside app/, modules/
  // and shared/ matched none of the checks, so it could deep-import a capability and app/** could
  // then import the laundered value through it cleanly.
  'src/lib/helper.ts': `
import { getWorkItems } from '@/modules/work-items/server/store'
export const helper = getWorkItems
`,
  'src/app/laundered/page.ts': `
import { helper } from '@/lib/helper'
export default helper
`,
  // A framework root file may sit outside the roots, because Next.js finds it only there, but it is
  // composition like app/** and reads capabilities through their public surfaces.
  'src/proxy.ts': `
import { getWorkItems } from '@/modules/work-items/server/store'
export const proxy = getWorkItems
`,
  'src/instrumentation.ts': `
import { getWorkItems } from '@/modules/work-items/server'
export const register = getWorkItems
`,
  // Neither a declaration file nor a development artifact is product code that needs an owner.
  'src/types/env.d.ts': `
declare const BUILD_ID: string
`,
  'src/mocks/handlers.ts': `
export const handlers = []
`,
  // A bridge that launders a private import: the bridge file is a development artifact by name,
  // but a production route consumes it, so the route is where the violation is reported.
  'src/mocks/bridge.ts': `
export { getWorkItems as secret } from '@/modules/work-items/server/store'
`,
  'src/app/via-mocks/page.ts': `
export { secret as default } from '@/mocks/bridge'
`,
  'src/lib/bridge.mock.ts': `
export { getWorkItems as secret } from '@/modules/work-items/server/store'
`,
  'src/app/via-mock-suffix/page.ts': `
export { secret as default } from '@/lib/bridge.mock'
`,
  // A directory import resolves to the bridge's index, and a route segment named after a test
  // folder still ships: both consumers are production.
  'src/mocks/index.ts': `
export { secret } from './bridge'
`,
  'src/app/via-mocks-index/page.ts': `
export { secret as default } from '@/mocks'
`,
  'src/app/tests/page.ts': `
export { secret as default } from '@/mocks/bridge'
`,
  // A directory entered through its package.json is still that directory.
  'src/fixtures/package.json': `{ "main": "bridge.ts" }
`,
  'src/fixtures/bridge.ts': `
export { getWorkItems as secret } from '@/modules/work-items/server/store'
`,
  'src/app/via-fixtures-package/page.ts': `
export { secret as default } from '@/fixtures'
`,
  // A trailing slash names the directory even when an owned file of the same name sits beside it;
  // without the slash the import is that owned file and stays clean.
  'src/modules/work-items/server/fixtures.ts': `
export const seed = []
`,
  'src/modules/work-items/server/fixtures/package.json': `{ "main": "bridge.ts" }
`,
  'src/modules/work-items/server/fixtures/bridge.ts': `
export const seed = []
`,
  'src/modules/work-items/server/reads/from-fixtures-directory.ts': `
export { seed } from '../fixtures/'
`,
  'src/modules/work-items/server/reads/from-fixtures-file.ts': `
export { seed } from '../fixtures'
`,
  // Legal: a development artifact importing another one, a test-only fixture nobody ships, and an
  // owned directory whose name only looks like a mock.
  'src/mocks/composed.ts': `
export { secret } from './bridge'
`,
  'src/modules/work-items/server/data.mock/index.ts': `
export const seed = []
`,
  'src/modules/work-items/server/seeded.ts': `
export { seed } from './data.mock'
`,

  // A NodeNext-extension file is a source file. The rules only see what their glob matches, and the
  // glob listed js/jsx/ts/tsx only — so this file was outside the architecture entirely while the
  // import parser could still see imports into it. The two halves of the floor disagreed about what
  // the project contains, and the narrower one was the one that judges.
  'src/modules/nodenext/domain/bad-internal.mts': `
import { getWorkItems } from '../../work-items/server/store.js'
export default getWorkItems
`,

  // A type-only edge is erased from the bundle, not from the vocabulary. Policy typed with a
  // provider row or a framework request is the layer leak a port exists to prevent, so pure zones
  // admit a type from a public root surface and from nowhere else.
  'src/modules/typed-policy/server/store.ts': `
export type PolicyRow = { id: string }
export const rows = (): PolicyRow[] => []
`,
  'src/modules/typed-policy/server.ts': `
import 'server-only'
export { rows } from './server/store.js'
export type { PolicyRow } from './server/store.js'
`,
  'src/modules/typed-policy/application/own-surface-type.ts': `
import type { PolicyRow } from '../server.js'
export type Admitted = PolicyRow
`,
  'src/modules/typed-policy/application/bad-adapter-type.ts': `
import type { PolicyRow } from '../server/store.js'
export type Leaked = PolicyRow
`,
  'src/modules/typed-policy/application/bad-provider-type.ts': `
import type { SupabaseClient } from '@supabase/supabase-js'
export type Leaked = SupabaseClient
`,
  'src/modules/typed-policy/domain/bad-adapter-type.ts': `
import type { PolicyRow } from '../server/store.js'
export type Leaked = PolicyRow
`,
  'src/modules/typed-policy/domain/bad-framework-type.ts': `
import type { NextRequest } from 'next/server'
export type Leaked = NextRequest
`,
  'src/modules/typed-policy/contracts.ts': `
export type { PolicyRow } from './server/store.js'
`,
  'src/shared/kernel/bad-server-type.ts': `
import type { log } from '../server/logger.js'
export type Leaked = typeof log
`,
  // Fail closed at the import, not at the manifest: a devDependency or a hoisted transitive package
  // is in no dependency list the classification check reads.
  'src/modules/typed-policy/domain/bad-unclassified.ts': `
import { parse } from 'yaml'
export default parse
`,

  // A channel surface resolves identity and reports for the request it owns. Called from under
  // another channel it does both a second time, so a neighbour's server code takes server.ts.
  'src/modules/board/server/bad-neighbour-rsc.ts': `
import { readWorkItems } from '../../work-items/rsc.js'
export default readWorkItems
`,
  'src/modules/board/server/bad-neighbour-action.ts': `
import { createLabel } from '../../labels/actions.js'
export default createLabel
`,
  'src/modules/board/client/use-label.ts': `
'use client'
import { createLabel } from '../../labels/actions.js'
export const create = createLabel
`,

  // A store or provider package is named by an adapter and by nothing else.
  'src/app/bad-provider/page.ts': `
import pg from 'pg'
export default pg
`,
  'src/modules/work-items/ui/BadProvider.tsx': `
'use client'
import { createClient } from '@supabase/supabase-js'
export default createClient
`,
  'src/modules/work-items/server/pool.ts': `
import pg from 'pg'
export default pg
`,
  'src/modules/work-items/client/realtime.ts': `
'use client'
import { createClient } from '@supabase/supabase-js'
export const subscribe = createClient
`,

  // The route composes capabilities; nothing depends back on a route.
  'src/app/work-items/_components/Row.ts': `
export const Row = () => null
`,
  'src/modules/work-items/ui/BadAppImport.tsx': `
import { Row } from '@/app/work-items/_components/Row'
export const BadAppImport = Row
`,
  'src/shared/ui/bad-app-import.ts': `
import { Row } from '@/app/work-items/_components/Row'
export const BadAppImport = Row
`,

  // A specifier the rules cannot resolve is read as a package and checked by nothing. Whatever
  // the project's own tsconfig resolves to a project file is a project import: a `paths` mapping
  // the contract does not declare, and a bare specifier the catch-all mapping finds under src/.
  'src/app/bad-undeclared-alias/page.ts': `
import { getWorkItems } from '~/modules/work-items/server/store'
export default getWorkItems
`,
  'src/app/bad-bare-specifier/page.ts': `
import { getWorkItems } from 'modules/work-items/server/store'
export default getWorkItems
`,

  // The resolver is TypeScript's: the candidate that exists, the mapping that matches best, the
  // entry a directory's package.json names.
  'src/app/only-in-app.ts': `
export const onlyInApp = 1
`,
  'src/modules/work-items/server/bad-fallback-alias.ts': `
import { onlyInApp } from '@work/only-in-app'
export default onlyInApp
`,
  'src/app/bad-outside-alias/page.ts': `
import { getWorkItems } from '@lib/bridge'
export default getWorkItems
`,
  'lib/pkg-bridge/package.json': `
{ "main": "bridge.ts" }
`,
  'lib/pkg-bridge/bridge.ts': `
export { getWorkItems } from '../../src/modules/work-items/server/store.js'
`,
  'src/app/bad-outside-main/page.ts': `
import { getWorkItems } from '../../../lib/pkg-bridge'
export default getWorkItems
`,

  // The directive prologue decides, on both sides of an import, and nothing that merely contains
  // the words does.
  'src/modules/work-items/ui/StrictIsland.tsx': `
'use strict'
'use client'
export const StrictIsland = () => null
`,
  'src/modules/work-items/server/views/bad-strict-island.tsx': `
import { StrictIsland } from '../../ui/StrictIsland.js'
export const BadStrictIsland = StrictIsland
`,
  'src/modules/work-items/ui/NotADirective.tsx': `
export const label = 'use client' + ' is not a directive here'
export const NotADirective = () => label
`,
  'src/modules/work-items/server/views/uses-plain-view.tsx': `
import { NotADirective } from '../../ui/NotADirective.js'
export const UsesPlainView = NotADirective
`,
  'src/app/late-directive/page.ts': `
import { getWorkItems } from '@/modules/work-items/server'
'use client'
export default getWorkItems
`,

  // A view is published to the browser by ui.ts, so it may not load what only a server can, and a
  // view that reaches browser-only code is a Client Component and has to say so.
  'src/modules/work-items/ui/BadNodeView.tsx': `
import fs from 'node:fs'
export const BadNodeView = () => fs
`,
  'src/modules/work-items/ui/BadHeadersView.tsx': `
import { cookies } from 'next/headers'
export const BadHeadersView = () => cookies
`,
  'src/modules/work-items/ui/BadUnmarkedView.ts': `
import { mutation } from '../client.js'
export const unmarked = mutation
`,

  // A declaration beside a JavaScript file describes that file. TypeScript resolves the import to
  // the declaration, and the runtime loads the implementation, so the rules judge the latter.
  'lib/typed-bridge.js': `
export { getWorkItems } from '../src/modules/work-items/server/store.js'
`,
  'lib/typed-bridge.d.ts': `
export declare const getWorkItems: () => unknown[]
`,
  'src/app/bad-outside-declared/page.ts': `
import { getWorkItems } from '../../../lib/typed-bridge.js'
export default getWorkItems
`,
  'src/modules/work-items/ui/DeclaredIsland.js': `
'use client'
export const DeclaredIsland = () => null
`,
  'src/modules/work-items/ui/DeclaredIsland.d.ts': `
export declare const DeclaredIsland: () => null
`,
  'src/modules/work-items/server/views/bad-declared-island.tsx': `
import { DeclaredIsland } from '../../ui/DeclaredIsland.js'
export const BadDeclaredIsland = DeclaredIsland
`,
  // A parenthesised string is an expression, not a directive, and a view that loads the
  // browser-only marker itself is browser-only.
  'src/modules/work-items/ui/BadParenView.ts': `
('use client')
import { mutation } from '../client.js'
export const paren = mutation
`,
  'src/modules/work-items/ui/BadClientOnlyView.ts': `
import 'client-only'
export const marked = 1
`,
  // An alias that names one project file for `import` and another for `require` is refused: the
  // rules would have to guess which one loads, and here one of the two is not importable.
  'src/modules/work-items/server/bad-split-alias.ts': `
import { id } from '#split'
export default id
`,
  // A package reached through a `package.json` imports alias is still that package.
  'src/app/bad-provider-alias/page.ts': `
import pool from '#driver'
export default pool
`,
  // A JavaScript surface with a declaration beside it is the same public surface when a type
  // edge resolves to the declaration.
  'src/modules/js-surface/server.js': `
import 'server-only'
export const listPlain = () => []
`,
  'src/modules/js-surface/server.d.ts': `
export declare const listPlain: () => unknown[]
export type Plain = { id: string }
`,
  'src/modules/typed-policy/application/js-surface-type.ts': `
import type { Plain } from '../../js-surface/server.js'
export type Admitted = Plain
`,
  // Only a real declaration suffix names another file's surface: `server.d.js` is a file called
  // `server.d`, and an action declaration describes signatures without being an action module.
  'src/modules/js-surface/rsc.d.js': `
export const notASurface = 1
`,
  'src/modules/js-surface/server/save.js': `
export async function save() {
  return { ok: true }
}
`,
  'src/modules/js-surface/actions.js': `
'use server'
import { save as saveImpl } from './server/save.js'
export async function save() {
  return saveImpl()
}
`,
  'src/modules/js-surface/actions.d.ts': `
export { save } from './server/save.js'
`,
  // A declaration file loads nothing: its re-export is a type edge, not a browser importing a server.
  'src/modules/js-surface/client.d.ts': `
export { listPlain } from './server.js'
`,
  // A relative path into node_modules names a file, not the entry point the contract classifies.
  'src/app/bad-provider-relative/page.ts': `
import pg from '../../../node_modules/pg/index.js'
export default pg
`,
  // A package installed under another name (`"db": "npm:pg@8"`) is still the package it is.
  'src/app/bad-provider-npm-alias/page.ts': `
import db from 'db'
export default db
`,
  // A package manager that links packages out of a store (pnpm) leaves the installed name on the
  // link and the package's own name on the real directory; the entry point answers to both.
  'src/modules/work-items/ui/BadLinkedServerView.tsx': `
import { read } from 'store-alias/server'
export const BadLinkedServerView = () => read
`,
  // A restriction the contract writes against an alias spelling holds for that spelling.
  'src/modules/work-items/ui/BadListedAliasView.tsx': `
import { edge } from '@vendor/plain-sdk/edge.js'
export const BadListedAliasView = () => edge
`,
  // ...and behind a package `imports` alias, where no file stands for it.
  'src/modules/work-items/ui/BadAliasedBuiltinView.tsx': `
import { readFile } from '#fs'
export const BadAliasedBuiltinView = () => readFile
`,
  // A Node builtin is the same module with or without the `node:` prefix.
  'src/modules/work-items/ui/BadBareBuiltinView.tsx': `
import fs from 'fs'
export const BadBareBuiltinView = () => fs
`,
  // An entry point is the file it loads, however the import spells it: with the extension the
  // contract entry omits, or through a tsconfig `paths` mapping into node_modules.
  'src/modules/work-items/ui/BadDeepServerView.tsx': `
import { read } from 'plain-sdk/server.js'
export const BadDeepServerView = () => read
`,
  'src/modules/work-items/ui/BadVendorPathView.tsx': `
import { read } from '@vendor/store-alias/index.js'
export const BadVendorPathView = () => read
`,
  // A linked workspace package is a package, also behind an alias: its real directory has no
  // node_modules in its path, the link it was found through does.
  'src/app/linked-workspace/page.ts': `
import { linked } from '#linked'
export default linked
`,
  // The name a package is installed under is the project's spelling of it: it can restrict, and
  // it cannot make another package pure.
  'src/modules/work-items/domain/bad-pure-alias.ts': `
import { read } from 'pure-alias'
export default read
`,
  // Two entry points of one package behind one alias are two targets: the classified entry
  // cannot answer for the other.
  'src/modules/work-items/domain/bad-entry-alias.ts': `
import { read } from '#entry'
export default read
`,
  // An erased import of the marker loads nothing, so it marks nothing.
  'src/modules/work-items/ui/ErasedMarkerView.ts': `
import type {} from 'client-only'
export const erased = 1
`,
  // A server-only entry point is not pure, whatever a contract also lists it as.
  'src/modules/typed-policy/domain/bad-server-package.ts': `
import { secret } from 'server-pure-conflict'
export default secret
`,

  // A provider's vocabulary is named by an adapter, as a type too: re-exported from a root
  // surface it would reach policy as a published type.
  'src/app/bad-provider-type/page.ts': `
import type { SupabaseClient } from '@supabase/supabase-js'
export type Leaked = SupabaseClient
`,
  'src/modules/provider-leak/server.ts': `
import 'server-only'
export type { SupabaseClient } from '@supabase/supabase-js'
`,

  // Code a framework hook loads runs in production, so it lives where the rules read it. A
  // config file beside package.json is outside the source root for a hook as for a route
  // (what instrumentation loads belongs under a contract root such as shared/server).
  'reporting.config.ts': `
export const configured = 1
`,
  'src/instrumentation-client.ts': `
import '../reporting.config'
`,
  'src/app/bad-root-config/page.ts': `
import { configured } from '../../../reporting.config'
export default configured
`,
  // The framework loads its root files by name. Nothing imports one: a route that did would
  // take a hook's runtime and whatever the hook loads along with it.
  'src/app/bad-hook-import/page.ts': `
import { register } from '../../instrumentation'
export default register
`,
  // A bundler follows `new URL('./file', import.meta.url)` to the file, which is how a worker is
  // loaded: it is an edge like an import. A computed name or an asset is not a module the rule
  // can place, and is left alone.
  'src/app/bad-worker/page.ts': `
export const worker = () => new Worker(new URL('../../modules/work-items/server/store.js', import.meta.url))
`,
  // A URL without a leading dot is still relative to the module, and the base may be written
  // with brackets.
  'src/app/bad-worker-bare/demo.fixture.ts': `
export const demo = 1
`,
  'src/app/bad-worker-bare/page.ts': `
export const worker = () => new Worker(new URL('demo.fixture.js', import.meta.url))
`,
  'src/app/bad-worker-bracket/page.ts': `
export const worker = () => new Worker(new URL('../../modules/work-items/server/store.js', import.meta['url']))
`,
  // An assertion the compiler erases leaves the same expression for the bundler, and a path
  // from the root is resolved against the project by Next's webpack configuration.
  'src/app/bad-worker-cast/page.ts': `
export const worker = () =>
  new Worker(new URL('../../modules/work-items/server/store.js' as const, import.meta.url as string))
`,
  'src/app/bad-worker-rooted/page.ts': `
export const worker = () => new Worker(new URL('/src/modules/work-items/server/store.js', import.meta.url))
`,
  // A rooted path may name a directory, loaded through its index like any other; and the
  // constructor may carry an assertion the compiler erases.
  'src/modules/work-items/server/worker/index.ts': `
export const run = 1
`,
  'src/app/bad-worker-directory/page.ts': `
export const worker = () => new Worker(new URL('/src/modules/work-items/server/worker', import.meta.url))
`,
  'src/app/bad-worker-constructor/page.ts': `
export const worker = () =>
  new Worker(new (URL as typeof URL)('../../modules/work-items/server/store.js', import.meta['url' as const]))
`,
  // A rooted path is resolved as the same path written relatively would be: a trailing slash
  // names the directory and not the file beside it, and a directory may name its entry in a
  // manifest.
  'src/modules/work-items/client/index.ts': `
export const inner = 1
`,
  'src/app/bad-worker-slash/page.ts': `
export const worker = () => new Worker(new URL('/src/modules/work-items/client/', import.meta.url))
`,
  'src/modules/work-items/server/packaged/package.json': `
{ "main": "run.js" }
`,
  'src/modules/work-items/server/packaged/run.ts': `
export const run = 1
`,
  // A bundler also enters a directory through the `module` field, which TypeScript does not read.
  'src/modules/work-items/server/esm-worker/package.json': `
{ "module": "./run.js" }
`,
  'src/modules/work-items/server/esm-worker/run.ts': `
export const run = 1
`,
  'src/app/bad-worker-module/page.ts': `
export const worker = () => new Worker(new URL('/src/modules/work-items/server/esm-worker', import.meta.url))
`,
  // A manifest that names one file in `main` and another in `module`: which one loads depends
  // on the build, so the rule refuses to guess, as it does for import and require.
  'src/modules/work-items/server/dual/package.json': `
{ "main": "./a.js", "module": "./b.js" }
`,
  'src/modules/work-items/server/dual/a.ts': `
export const which = 'a'
`,
  'src/modules/work-items/server/dual/b.ts': `
export const which = 'b'
`,
  'src/modules/work-items/server/bad-dual-entry.ts': `
import { which } from './dual'
export default which
`,
  'src/app/bad-worker-main/page.ts': `
export const worker = () => new Worker(new URL('/src/modules/work-items/server/packaged', import.meta.url))
`,
  'src/app/asset-url/page.ts': `
export const logo = new URL('./logo.png', import.meta.url)
export const icon = (name: string) => new URL(name, import.meta.url)
export const remote = new URL('https://example.test/worker.js', import.meta.url)
export const rooted = new URL('/worker.js', import.meta.url)
// new.target is not import.meta: its url is whatever a subclass put there.
export class Loader {
  constructor() {
    const base = new.target as unknown as { url: string; webpackContext(directory: string): unknown }
    void new URL('../../modules/work-items/server/store.js', (new.target as unknown as { url: string }).url)
    void base.webpackContext('./parts')
    void (new.target as unknown as { webpackContext(directory: string): unknown }).webpackContext('./parts')
  }
}
`,
  // A declaration beside the source root's files is not a file the framework loads.
  'src/middleware.d.ts': `
export type Matcher = { source: string }
`,
  'src/app/hook-types/page.ts': `
import type { Matcher } from '../../middleware'
export type Admitted = Matcher
`,
  // A context loader names a directory, not a module: what it loads is hidden from every check,
  // a development artifact included.
  'src/app/bad-context/page.ts': `
declare const require: { context(directory: string, deep: boolean): unknown }
export default require.context('./parts', true)
`,
  'src/app/bad-context-meta/page.ts': `
export default (import.meta as unknown as { webpackContext(directory: string): unknown }).webpackContext('./parts')
`,
  // The bundler reads a literal member name in brackets as it reads one after a dot.
  'src/app/bad-context-bracket/page.ts': `
declare const require: { context(directory: string, deep: boolean): unknown }
export default require['context']('./parts', true)
`,
  'src/app/bad-context-meta-bracket/page.ts': `
export default (import.meta as unknown as { webpackContext(directory: string): unknown })['webpackContext']('./parts')
`,
  // A story ships nowhere: what it imports from outside the source root reaches no production
  // file, because none may import a development artifact.
  'src/modules/work-items/ui/WorkItemsView.stories.ts': `
import { getWorkItems } from '../../../../lib/bridge.js'
export const fixture = getWorkItems
`,
  // A source file outside sourceRoot is linted by nobody, so it launders any import it re-exports.
  'lib/bridge.ts': `
export { getWorkItems } from '../src/modules/work-items/server/store.js'
`,
  'src/app/bad-outside/page.ts': `
import { getWorkItems } from '../../../lib/bridge.js'
export default getWorkItems
`,
  'src/app/outside-data/page.ts': `
import manifest from '../../../package.json'
export default manifest
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
  ['src/modules/bad-action-directive/actions.ts', 'actionDirective'],
  ['src/modules/bad-action-late-directive/actions.ts', 'actionDirective'],
  ['src/modules/bad-action-sync/actions.ts', 'actionValueExport'],
  ['src/modules/bad-action-local-export/actions.ts', 'actionValueExport'],
  ['src/modules/bad-action-object/actions.ts', 'actionValueExport'],
  ['src/modules/bad-action-import-reexport/actions.ts', 'actionReexport'],
  ['src/modules/bad-action-unary/actions.ts', 'actionValueExport'],
  ['src/modules/bad-action-binary/actions.ts', 'actionValueExport'],
  ['src/modules/bad-action-enum/actions.ts', 'actionValueExport'],
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
  // A type-only edge keeps the ownership rules: the coupling to a neighbour's private file and to
  // a capability's internals survives the compiler erasing the binding.
  ['src/modules/type-consumer/domain/bad-type-internal.ts', 'crossCapabilityInternal'],
  ['src/modules/type-consumer/domain/bad-import-type.ts', 'crossCapabilityInternal'],
  ['src/app/bad-type-internal/page.ts', 'appInternal'],
  // The same import as a value is the runtime edge the type-only form is not.
  ['src/modules/type-consumer/client/bad-value.ts', 'browserServer'],
  ['src/modules/billing/contracts.ts', 'neutralDirection'],
  ['src/modules/work-items/ui/BadServerReach.tsx', 'browserServer'],
  ['src/modules/work-items/ui/ReadsRsc.tsx', 'browserServer'],
  ['src/modules/work-items/server/views/bad-island.tsx', 'serverClient'],
  ['src/modules/typed-policy/application/bad-adapter-type.ts', 'applicationDirection'],
  ['src/modules/typed-policy/application/bad-provider-type.ts', 'applicationDirection'],
  ['src/modules/typed-policy/domain/bad-adapter-type.ts', 'domainDirection'],
  ['src/modules/typed-policy/domain/bad-framework-type.ts', 'domainDirection'],
  ['src/modules/typed-policy/contracts.ts', 'neutralDirection'],
  ['src/shared/kernel/bad-server-type.ts', 'sharedKernelDirection'],
  ['src/modules/typed-policy/domain/bad-unclassified.ts', 'unclassifiedPackage'],
  ['src/modules/board/server/bad-neighbour-rsc.ts', 'foreignChannel'],
  ['src/modules/board/server/bad-neighbour-action.ts', 'foreignChannel'],
  ['src/app/bad-provider/page.ts', 'providerOutsideAdapter'],
  ['src/modules/work-items/ui/BadProvider.tsx', 'providerOutsideAdapter'],
  ['src/modules/work-items/ui/BadAppImport.tsx', 'appIsLeaf'],
  ['src/shared/ui/bad-app-import.ts', 'appIsLeaf'],
  ['src/app/bad-outside/page.ts', 'outsideSourceRoot'],
  ['src/app/bad-undeclared-alias/page.ts', 'appInternal'],
  ['src/app/bad-bare-specifier/page.ts', 'appInternal'],
  ['src/modules/work-items/server/bad-fallback-alias.ts', 'appIsLeaf'],
  ['src/app/bad-outside-alias/page.ts', 'outsideSourceRoot'],
  ['src/app/bad-root-config/page.ts', 'outsideSourceRoot'],
  ['src/instrumentation-client.ts', 'outsideSourceRoot'],
  ['src/app/bad-hook-import/page.ts', 'frameworkRootImport'],
  ['src/app/bad-worker/page.ts', 'appInternal'],
  ['src/app/bad-worker-bare/page.ts', 'devArtifactInProduction'],
  ['src/app/bad-worker-bracket/page.ts', 'appInternal'],
  ['src/app/bad-worker-cast/page.ts', 'appInternal'],
  ['src/app/bad-worker-rooted/page.ts', 'appInternal'],
  ['src/app/bad-worker-directory/page.ts', 'appInternal'],
  ['src/app/bad-worker-slash/page.ts', 'appInternal'],
  ['src/modules/work-items/client/index.ts', 'shadowedSegmentIndex'],
  ['src/app/bad-worker-main/page.ts', 'appInternal'],
  ['src/app/bad-worker-module/page.ts', 'appInternal'],
  ['src/modules/work-items/server/bad-dual-entry.ts', 'ambiguousResolution'],
  ['src/app/bad-worker-constructor/page.ts', 'appInternal'],
  ['src/app/bad-context/page.ts', 'hiddenDynamicImport'],
  ['src/app/bad-context-meta/page.ts', 'hiddenDynamicImport'],
  ['src/app/bad-context-bracket/page.ts', 'hiddenDynamicImport'],
  ['src/app/bad-context-meta-bracket/page.ts', 'hiddenDynamicImport'],
  ['src/app/bad-outside-main/page.ts', 'outsideSourceRoot'],
  ['src/modules/work-items/server/views/bad-strict-island.tsx', 'serverClient'],
  ['src/modules/work-items/ui/BadNodeView.tsx', 'browserServer'],
  ['src/modules/work-items/ui/BadHeadersView.tsx', 'browserServer'],
  ['src/modules/work-items/ui/BadUnmarkedView.ts', 'clientBoundaryMissing'],
  ['src/app/bad-provider-type/page.ts', 'providerOutsideAdapter'],
  ['src/app/bad-provider-alias/page.ts', 'providerOutsideAdapter'],
  ['src/app/bad-provider-relative/page.ts', 'packageByPath'],
  ['src/app/bad-provider-npm-alias/page.ts', 'providerOutsideAdapter'],
  ['src/modules/work-items/ui/BadLinkedServerView.tsx', 'browserServer'],
  ['src/modules/work-items/ui/BadVendorPathView.tsx', 'browserServer'],
  ['src/modules/work-items/ui/BadDeepServerView.tsx', 'browserServer'],
  ['src/modules/work-items/ui/BadBareBuiltinView.tsx', 'browserServer'],
  ['src/modules/work-items/ui/BadListedAliasView.tsx', 'browserServer'],
  ['src/modules/work-items/ui/BadAliasedBuiltinView.tsx', 'browserServer'],
  ['src/modules/work-items/domain/bad-entry-alias.ts', 'unclassifiedPackage'],
  ['src/modules/work-items/domain/bad-pure-alias.ts', 'unclassifiedPackage'],
  ['src/modules/work-items/server/bad-split-alias.ts', 'ambiguousResolution'],
  ['src/modules/js-surface/rsc.d.js', 'unknownSurface'],
  ['src/app/bad-outside-declared/page.ts', 'outsideSourceRoot'],
  ['src/modules/work-items/server/views/bad-declared-island.tsx', 'serverClient'],
  ['src/modules/work-items/ui/BadParenView.ts', 'clientBoundaryMissing'],
  ['src/modules/work-items/ui/BadClientOnlyView.ts', 'clientBoundaryMissing'],
  ['src/modules/typed-policy/domain/bad-server-package.ts', 'domainDirection'],
  ['src/modules/provider-leak/server.ts', 'providerOutsideAdapter'],
  ['src/modules/import-equals/domain/bad-internal.ts', 'crossCapabilityInternal'],
  ['src/modules/import-equals/domain/bad-module-require.ts', 'domainDirection'],
  ['src/modules/work-items/domain/bad-subpath.ts', 'domainDirection'],
  ['src/modules/work-items/server/hidden-template.ts', 'hiddenDynamicImport'],
  ['src/modules/work-items/ui/ClientList.tsx', 'browserServer'],
  ['src/lib/helper.ts', 'unknownRoot'],
  ['src/proxy.ts', 'appInternal'],
  ['src/app/via-mocks/page.ts', 'devArtifactInProduction'],
  ['src/app/via-mock-suffix/page.ts', 'devArtifactInProduction'],
  ['src/app/via-mocks-index/page.ts', 'devArtifactInProduction'],
  ['src/app/tests/page.ts', 'devArtifactInProduction'],
  ['src/app/via-fixtures-package/page.ts', 'devArtifactInProduction'],
  ['src/modules/work-items/server/reads/from-fixtures-directory.ts', 'devArtifactInProduction'],
])

// The runtime markers live in the resolved tier: they are a build guarantee about a whole module,
// not a judgement about one import.
const expectedMarkers = new Map([
  ['src/modules/marker/server.ts', 'clean-runtime/runtime-markers'],
  ['src/modules/marker/client.ts', 'clean-runtime/runtime-markers'],
  ['src/modules/marker/job.ts', 'clean-runtime/runtime-markers'],
  ['src/modules/marker-type/server.ts', 'clean-runtime/runtime-markers'],
  ['src/modules/marker-type/client.ts', 'clean-runtime/runtime-markers'],
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
  'src/modules/work-items/server/packaged/run.ts',
  'src/modules/work-items/server/esm-worker/run.ts',
  'src/modules/work-items/server/dual/a.ts',
  'src/modules/work-items/server/dual/b.ts',
  'src/modules/work-items/server/worker/index.ts',
  'src/app/asset-url/page.ts',
  'src/app/hook-types/page.ts',
  'src/modules/work-items/ui/WorkItemsView.stories.ts',
  'src/app/linked-workspace/page.ts',
  // The permitting half of generatedProviderLeak: a private server adapter IS where a provider row
  // is translated, so this import must stay clean or the rule only proves it can say no.
  'src/modules/work-items/server/rows.ts',
  'src/modules/labels/server.ts',
  'src/modules/labels/actions.ts',
  'src/modules/good-actions/actions.ts',
  'src/modules/good-action-wrapped/actions.ts',
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
  'src/modules/board/application/ports.ts',
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
  'src/modules/type-consumer/client/view.ts',
  'src/modules/type-consumer/client/inline-type.ts',
  'src/modules/type-consumer/client/import-type.ts',
  'src/modules/type-consumer/client.ts',
  'src/modules/campaign/domain/model.ts',
  'src/modules/campaign/contracts.ts',
  'src/modules/agency/domain/policy.ts',
  'src/modules/pricing/domain/price.ts',
  'src/modules/pricing/contracts.ts',
  'src/modules/checkout/domain/quote.ts',
  'src/modules/work-items/domain/template-import.ts',
  'src/modules/work-items/ui/ListView.tsx',
  'src/modules/work-items/ui/ErasedMarkerView.ts',
  'src/modules/js-surface/server.d.ts',
  'src/modules/js-surface/actions.d.ts',
  'src/modules/js-surface/client.d.ts',
  'src/modules/typed-policy/application/js-surface-type.ts',
  'src/modules/work-items/ui/StrictIsland.tsx',
  'src/modules/work-items/ui/NotADirective.tsx',
  'src/modules/work-items/server/views/uses-plain-view.tsx',
  'src/app/late-directive/page.ts',
  'src/app/only-in-app.ts',
  'src/modules/work-items/ui/Island.tsx',
  'src/modules/work-items/server/views/server-list.tsx',
  'src/modules/typed-policy/server.ts',
  'src/modules/typed-policy/application/own-surface-type.ts',
  'src/modules/board/client/use-label.ts',
  'src/modules/work-items/server/pool.ts',
  'src/modules/work-items/client/realtime.ts',
  'src/app/work-items/_components/Row.ts',
  'src/app/outside-data/page.ts',
  'src/modules/marker/rsc.ts',
  // The permitting half of unknownRoot and the widened appInternal: a framework root file reading a
  // public surface, and the files outside the roots that have no product owner to find.
  'src/instrumentation.ts',
  'src/types/env.d.ts',
  'src/mocks/handlers.ts',
  'src/mocks/bridge.ts',
  'src/lib/bridge.mock.ts',
  'src/mocks/composed.ts',
  'src/mocks/index.ts',
  'src/modules/work-items/server/data.mock/index.ts',
  'src/modules/work-items/server/seeded.ts',
  'src/modules/work-items/server/fixtures.ts',
  'src/modules/work-items/server/reads/from-fixtures-file.ts',
])

if (ESLint) {
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'capability-rules-')))
  const sibling = `${sandbox}-sibling`
  const previousCwd = process.cwd()
  try {
    // A real node_modules: the repository's packages by link, plus the few the fixtures import and
    // this repository does not install. They are packages to the rules because that is what they
    // are here, not because a tsconfig mapping hides a project file behind a package name.
    fs.mkdirSync(path.join(sandbox, 'node_modules'))
    for (const entry of fs.readdirSync(path.join(root, 'node_modules'))) {
      fs.symlinkSync(path.join(root, 'node_modules', entry), path.join(sandbox, 'node_modules', entry))
    }
    const stubPackage = (directoryName, js, dts, manifest = {}) => {
      const directory = path.join(sandbox, 'node_modules', directoryName)
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(path.join(directory, 'package.json'), `${JSON.stringify({ name: directoryName, version: '0.0.0', main: 'index.js', types: 'index.d.ts', ...manifest })}\n`)
      fs.writeFileSync(path.join(directory, 'index.js'), js)
      fs.writeFileSync(path.join(directory, 'index.d.ts'), dts)
    }
    stubPackage('server-only', 'export {}\n', 'export {}\n')
    stubPackage('client-only', 'export {}\n', 'export {}\n')
    stubPackage('pg', 'export default {}\n', 'declare const pg: object\nexport default pg\n')
    stubPackage('@supabase/supabase-js', 'export const createClient = () => null\n', 'export declare const createClient: () => null\nexport type SupabaseClient = object\n')
    stubPackage(
      'valibot',
      'export const object = (shape) => shape\nexport const array = (item) => item\nexport const string = () => null\nexport const pipe = (...steps) => steps\n',
      'export declare const object: (shape: unknown) => unknown\nexport declare const array: (item: unknown) => unknown\nexport declare const string: () => null\nexport declare const pipe: (...steps: unknown[]) => unknown[]\n'
    )
    // Installed as `db`, named `pg` by its own manifest: what `"db": "npm:pg@8"` leaves on disk.
    stubPackage('db', 'export default {}\n', 'declare const db: object\nexport default db\n', { name: 'pg' })
    // Installed under a name the sandbox contract lists as pure; its manifest names another package.
    stubPackage('pure-alias', 'export const read = () => null\n', 'export declare const read: () => null\n', { name: 'impure-real' })
    // One package, two entry points; the sandbox contract classifies only `entry-sdk/schema`.
    stubPackage('entry-sdk', 'export const read = () => null\n', 'export declare const read: () => null\n', {
      exports: { './schema': './index.js', './io': './io.js' },
    })
    fs.writeFileSync(path.join(sandbox, 'node_modules/entry-sdk/io.js'), 'export const read = () => null\n')
    fs.writeFileSync(path.join(sandbox, 'node_modules/entry-sdk/io.d.ts'), 'export declare const read: () => null\n')
    // No export map: `plain-sdk/server` and `plain-sdk/server.js` are one file.
    stubPackage('plain-sdk', 'export {}\n', 'export {}\n')
    fs.writeFileSync(path.join(sandbox, 'node_modules/plain-sdk/server.js'), 'export const read = () => null\n')
    fs.writeFileSync(path.join(sandbox, 'node_modules/plain-sdk/server.d.ts'), 'export declare const read: () => null\n')
    fs.writeFileSync(path.join(sandbox, 'node_modules/plain-sdk/edge.js'), 'export const edge = () => null\n')
    fs.writeFileSync(path.join(sandbox, 'node_modules/plain-sdk/edge.d.ts'), 'export declare const edge: () => null\n')
    // An installed package named like a builtin does not change what Node loads for that name.
    stubPackage('fs', 'export default {}\n', 'declare const fs: object\nexport default fs\n')
    // A store layout: the real package outside the top-level node_modules, a link under another name.
    stubPackage('.store/store-sdk@1.0.0/node_modules/store-sdk', 'export const read = () => null\n', 'export declare const read: () => null\n', {
      name: 'store-sdk',
      exports: { './server': './index.js' },
    })
    fs.symlinkSync(path.join(sandbox, 'node_modules/.store/store-sdk@1.0.0/node_modules/store-sdk'), path.join(sandbox, 'node_modules/store-alias'), 'dir')
    // A workspace package: a directory of the repository, linked into node_modules.
    fs.mkdirSync(path.join(sandbox, 'packages/linked'), { recursive: true })
    fs.writeFileSync(path.join(sandbox, 'packages/linked/package.json'), '{"name":"linked","version":"0.0.0","type":"module","main":"index.js"}\n')
    fs.writeFileSync(path.join(sandbox, 'packages/linked/index.js'), 'export const linked = 1\n')
    fs.symlinkSync(path.join(sandbox, 'packages/linked'), path.join(sandbox, 'node_modules/linked'), 'dir')
    // `#driver` is a package behind a project-local name: the contract classifies the package.
    fs.writeFileSync(
      path.join(sandbox, 'package.json'),
      `${JSON.stringify({
        private: true,
        type: 'module',
        // `#split` names a kernel file for `import` and a route-private one for `require`.
        imports: { '#driver': 'pg', '#fs': 'fs/promises', '#linked': 'linked', '#entry': { import: 'entry-sdk/schema', require: 'entry-sdk/io' }, '#split': { import: './src/shared/kernel/id.ts', require: './src/app/only-in-app.ts' } },
      })}\n`
    )
    fs.mkdirSync(path.join(sandbox, 'rules'))
    for (const source of [BASE, STRICT, CONTRACT, PATHS, KEYS, CYCLES, CENSUS]) {
      fs.copyFileSync(path.join(root, source), path.join(sandbox, 'rules', path.basename(source)))
    }
    // `generatedRoot` is deliberately absent from the shipped contract: declared there, every repo
    // adopting the floor would inherit a generated root it never has. The sandbox declares it so the
    // rule has something to bind to; the inert-when-absent case is asserted separately below.
    fs.writeFileSync(
      path.join(sandbox, 'rules', 'architecture-contract.json'),
      `${JSON.stringify(
        (() => {
          const shipped = JSON.parse(fs.readFileSync(path.join(root, CONTRACT), 'utf8'))
          return {
            ...shipped,
            generatedRoot: 'src/generated',
            // A package name, not a scope: the subpath fixture proves `@scope/pkg/sub` inherits it.
            runtimePackages: [...shipped.runtimePackages, '@scope/pkg'],
            // A contradiction the dependency check refuses; the rule still treats it as server-only.
            purePackages: [...shipped.purePackages, 'server-pure-conflict', 'entry-sdk/schema', 'pure-alias'],
            serverPackages: [...shipped.serverPackages, 'server-pure-conflict', 'store-sdk/server', 'plain-sdk/server', '@vendor/plain-sdk/edge.js'],
          }
        })(),
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
            paths: {
              '@/*': ['./src/*'],
              // A mapping the contract does not repeat. TypeScript resolves it into the source
              // root all the same, so the rules must too, or it launders every boundary.
              '~/*': ['./src/*'],
              // TypeScript takes the first candidate that exists, so the rules must as well: the
              // file below exists only under app/.
              '@work/*': ['./src/shared/kernel/*', './src/app/*'],
              // A mapping to source outside the source root is still a project import.
              '@lib/*': ['./lib/*'],
              '@vendor/*': ['./node_modules/*'],
              // A catch-all: every package name is tried under src/ first and found in
              // node_modules, which must leave it a package.
              '*': ['./src/*'],
            },
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
      `${parser}import boundaries from './rules/eslint-boundaries.mjs'\nexport default [ts, ...boundaries]\n`
    )
    fs.writeFileSync(
      path.join(sandbox, 'eslint.config.strict.mjs'),
      `${parser}import boundaries from './rules/eslint-boundaries.mjs'\nimport strict from './rules/eslint-boundaries-resolved.mjs'\nexport default [ts, ...boundaries, ...strict]\n`
    )

    // The census layout of the migration procedure: warn everywhere, error only under work-items.
    fs.writeFileSync(
      path.join(sandbox, 'eslint.config.census.mjs'),
      `${parser}import boundaries from './rules/eslint-boundaries.mjs'\nimport strict from './rules/eslint-boundaries-resolved.mjs'\nimport { censusScope } from './rules/census-scope.mjs'\nexport default [ts, ...censusScope([...boundaries, ...strict], ['src/modules/work-items/**'])]\n`
    )

    for (const [relative, source] of Object.entries(files)) {
      const absolute = path.join(sandbox, relative)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, `${source.trim()}\n`)
    }
    // A source file in a sibling project sits outside the project root as well as the source
    // root; a relative path reaches it all the same.
    fs.mkdirSync(sibling)
    fs.writeFileSync(path.join(sibling, 'store.ts'), 'export const foreign = 1\n')
    fs.mkdirSync(path.join(sandbox, 'src/app/bad-sibling'), { recursive: true })
    fs.writeFileSync(
      path.join(sandbox, 'src/app/bad-sibling/page.ts'),
      `import { foreign } from '../../../../${path.basename(sibling)}/store'\nexport default foreign\n`
    )
    expectedBase.set('src/app/bad-sibling/page.ts', 'outsideSourceRoot')

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

    const censusResults = await lint('eslint.config.census.mjs')
    const severityOf = (file, ruleId) =>
      censusResults.get(file)?.find((message) => message.ruleId === ruleId)?.severity
    for (const [file, ruleId, severity] of [
      ['src/modules/work-items/domain/bad-server.ts', 'clean-architecture/boundaries', SEVERITY.error],
      ['src/modules/board/server/bad-internal.ts', 'clean-architecture/boundaries', SEVERITY.warn],
      ['src/app/bad-internal/page.ts', 'clean-architecture/boundaries', SEVERITY.warn],
    ]) {
      if (severityOf(file, ruleId) !== severity) {
        errors.push(`census scope: ${file} expected severity ${severity} for ${ruleId}; received ${severityOf(file, ruleId)}`)
      }
    }

    // censusScope on its own with core rules: the cases the boundary fixture cannot reach.
    const syntheticFiles = {
      'census-synthetic/modules/a.js': 'debugger;\nalert("x");',
      'census-synthetic/modules/a.test.js': 'debugger;',
      'census-synthetic/modules/ignored.js': 'var x = 1;\nx;',
      'census-synthetic/other/b.js': 'debugger;',
    }
    for (const [relative, source] of Object.entries(syntheticFiles)) {
      const absolute = path.join(sandbox, relative)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, `${source}\n`)
    }
    const syntheticConfigs = [
      { files: ['**/*.js'], rules: { 'no-debugger': 'error', 'no-alert': 'off' } },
      { files: ['**/*.test.js'], rules: { 'no-debugger': 'off' } },
      { files: ['**/*.js'], ignores: ['**/ignored.js'], settings: { marker: 1 }, languageOptions: { sourceType: 'module' }, rules: { 'no-var': 'error' } },
    ]
    const { censusScope } = await import(pathToFileURL(path.join(sandbox, 'rules', 'census-scope.mjs')).href)
    const lintSynthetic = async (blockingFiles) => {
      const eslint = new ESLint({ cwd: sandbox, overrideConfigFile: true, overrideConfig: censusScope(syntheticConfigs, blockingFiles) })
      const results = await eslint.lintFiles(['census-synthetic'])
      return new Map(results.map((result) => [posix(path.relative(sandbox, result.filePath)), result.messages]))
    }
    const syntheticSeverity = (results, file, ruleId) =>
      results.get(`census-synthetic/${file}`)?.find((message) => message.ruleId === ruleId)?.severity
    const scoped = await lintSynthetic(['census-synthetic/modules/**'])
    const warnOnly = await lintSynthetic([])
    for (const [label, results, file, ruleId, expected] of [
      ['blocking glob', scoped, 'modules/a.js', 'no-debugger', SEVERITY.error],
      ['outside the blocking glob', scoped, 'other/b.js', 'no-debugger', SEVERITY.warn],
      ['test-file exemption under the blocking glob', scoped, 'modules/a.test.js', 'no-debugger', undefined],
      ['an off rule stays off', scoped, 'modules/a.js', 'no-alert', undefined],
      ['an ignored file stays ignored in the gate', scoped, 'modules/ignored.js', 'no-var', undefined],
      ['empty blocking list: census only', warnOnly, 'modules/a.js', 'no-debugger', SEVERITY.warn],
      ['empty blocking list: an off rule stays off', warnOnly, 'modules/a.js', 'no-alert', undefined],
    ]) {
      const received = syntheticSeverity(results, file, ruleId)
      if (received !== expected) errors.push(`census scope (${label}): ${file} ${ruleId} expected ${expected}; received ${received}`)
    }
    // Override order and meaning: severity is the only thing censusScope may change. Each case lints
    // real ESLint output, with the order-sensitive entry placed after the rule-bearing one.
    const orderFiles = {
      'census-order/modules/p.js': 'export const v = 1;\ndebugger;',
      'census-order/other/p.js': 'export const v = 1;\ndebugger;',
      'census-order/modules/s.js': 'const v = 1;',
      'census-order/other/s.js': 'const v = 1;',
      'census-order/ignored/i.js': 'debugger;',
      'census-order/bp/migrated/b.js': 'debugger;',
      'census-order/bp/legacy/b.js': 'debugger;',
    }
    for (const [relative, source] of Object.entries(orderFiles)) {
      const absolute = path.join(sandbox, relative)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, `${source}\n`)
    }
    const probePlugin = {
      rules: {
        policy: {
          meta: { type: 'problem', schema: [], messages: { bad: 'Policy violation.' } },
          create: (context) => ({ Program: (node) => { if (context.settings.enforcePolicy) context.report({ node, messageId: 'bad' }) } }),
        },
      },
    }
    const lintOrder = async (configs, blockingFiles, target) => {
      const eslint = new ESLint({ cwd: sandbox, overrideConfigFile: true, overrideConfig: censusScope(configs, blockingFiles) })
      const results = await eslint.lintFiles([target])
      return new Map(results.map((result) => [posix(path.relative(sandbox, result.filePath)), result.messages]))
    }
    const orderSeverity = (results, file, ruleId) => results.get(file)?.find((message) => message.ruleId === ruleId)?.severity
    const orderBlocking = ['census-order/modules/**']
    const orderCases = [
      {
        label: 'a later rule-free sourceType override survives',
        configs: [
          { files: ['**/*.js'], languageOptions: { sourceType: 'script' }, rules: { 'no-debugger': 'error' } },
          { files: ['**/*.js'], languageOptions: { sourceType: 'module' } },
        ],
        target: 'census-order/modules/p.js',
        other: 'census-order/other/p.js',
        ruleId: 'no-debugger',
      },
      {
        label: 'a later rule-free settings override survives',
        configs: [
          { files: ['**/*.js'], plugins: { probe: probePlugin }, settings: { enforcePolicy: false }, rules: { 'probe/policy': 'error' } },
          { files: ['**/*.js'], settings: { enforcePolicy: true } },
        ],
        target: 'census-order/modules/s.js',
        other: 'census-order/other/s.js',
        ruleId: 'probe/policy',
      },
    ]
    for (const { label, configs, target, other, ruleId } of orderCases) {
      const folder = target.slice(0, target.indexOf('/modules/') + 1)
      const results = await lintOrder(configs, orderBlocking, folder)
      for (const file of [target, other]) {
        if (results.get(file)?.some((message) => message.fatal)) errors.push(`census scope (${label}): ${file} no longer parses`)
      }
      if (orderSeverity(results, target, ruleId) !== SEVERITY.error) {
        errors.push(`census scope (${label}): ${target} ${ruleId} expected ${SEVERITY.error}; received ${orderSeverity(results, target, ruleId)}`)
      }
      if (orderSeverity(results, other, ruleId) !== SEVERITY.warn) {
        errors.push(`census scope (${label}): ${other} ${ruleId} expected ${SEVERITY.warn}; received ${orderSeverity(results, other, ruleId)}`)
      }
    }

    const ignoreResults = await lintOrder(
      [{ ignores: ['census-order/ignored/**'] }, { files: ['**/*.js'], rules: { 'no-debugger': 'error' } }],
      ['census-order/ignored/**', 'census-order/other/**'],
      'census-order/',
    )
    if (ignoreResults.has('census-order/ignored/i.js')) errors.push('census scope (global ignores): an ignored file was linted')
    if (orderSeverity(ignoreResults, 'census-order/other/p.js', 'no-debugger') !== SEVERITY.error) {
      errors.push('census scope (global ignores): a non-ignored file under a blocking glob must stay an error')
    }

    const basePathResults = await lintOrder(
      [{ basePath: 'census-order/bp', files: ['**/*.js'], rules: { 'no-debugger': 'error' } }],
      ['census-order/bp/migrated/**'],
      'census-order/bp/',
    )
    for (const [file, expected] of [['census-order/bp/migrated/b.js', SEVERITY.error], ['census-order/bp/legacy/b.js', SEVERITY.warn]]) {
      if (orderSeverity(basePathResults, file, 'no-debugger') !== expected) {
        errors.push(`census scope (basePath): ${file} no-debugger expected ${expected}; received ${orderSeverity(basePathResults, file, 'no-debugger')}`)
      }
    }

    // A blocking glob and a basePath can overlap in any glob shape: a parent directory, a wildcard
    // segment, a leading globstar that swallows the base, a non-canonical base. Each file is checked
    // against the severity a root-level blocker gives it.
    const basePathCases = [
      ['parent root', 'census-bp/src/modules', 'census-bp/src/**', 'census-bp/src/modules/orders/a.js', SEVERITY.error],
      ['parent capability root', 'census-bp/src/modules/orders/ui', 'census-bp/src/modules/orders/**', 'census-bp/src/modules/orders/ui/a.js', SEVERITY.error],
      ['wildcard segment', 'census-bp/src/modules/orders', 'census-bp/src/*/orders/**', 'census-bp/src/modules/orders/a.js', SEVERITY.error],
      ['leading globstar over the base', 'census-bp/src', '**/src/migrated/**', 'census-bp/src/migrated/a.js', SEVERITY.error],
      ['leading globstar over a capability', 'census-bp/src/modules/orders', '**/orders/**', 'census-bp/src/modules/orders/a.js', SEVERITY.error],
      ['non-canonical base', './census-bp/src/../src', 'census-bp/src/migrated/**', 'census-bp/src/migrated/a.js', SEVERITY.error],
      ['trailing-slash base', './census-bp/src/', 'census-bp/src/migrated/**', 'census-bp/src/migrated/a.js', SEVERITY.error],
      ['glob outside the base', 'census-bp/src/modules', 'census-bp/other/**', 'census-bp/src/modules/orders/a.js', SEVERITY.warn],
      ['own ignores stay relative to the base', 'census-bp/src', 'census-bp/src/**', 'census-bp/src/legacy/a.js', undefined, ['legacy/**']],
      ['negation-only files, a file outside src', 'census-bp/src/modules', '**/*', 'census-bp/outside/a.js', undefined, undefined, ['!**/excluded.js']],
      ['negation-only files, a sibling of the base', 'census-bp/src/modules', '**/*', 'census-bp/src/other/a.js', undefined, undefined, ['!**/excluded.js']],
      ['negation-only files, a file in the base', 'census-bp/src/modules', '**/*', 'census-bp/src/modules/orders/a.js', SEVERITY.error, undefined, ['!**/excluded.js']],
    ]
    for (const [, , , file] of basePathCases) {
      fs.mkdirSync(path.join(sandbox, path.dirname(file)), { recursive: true })
      fs.writeFileSync(path.join(sandbox, file), 'debugger;\n')
    }
    for (const [label, basePath, blocking, file, expected, ignores, files = ['**/*.js']] of basePathCases) {
      const results = await lintOrder(
        [{ basePath, files, ...(ignores ? { ignores } : {}), rules: { 'no-debugger': 'error' } }],
        [blocking],
        file,
      )
      if (orderSeverity(results, file, 'no-debugger') !== expected) {
        errors.push(`census scope (basePath, ${label}): ${file} no-debugger expected ${expected}; received ${orderSeverity(results, file, 'no-debugger')}`)
      }
    }

    const graphResult = spawnSync(process.execPath, [path.join(sandbox, 'rules', path.basename(CYCLES))], {
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

    for (const [file, ruleId] of [...expectedStrict, ...expectedMarkers]) {
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
        [path.join(sandbox, 'rules', path.basename(CYCLES))],
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
      [path.join(sandbox, 'rules', path.basename(CYCLES))],
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
              message.ruleId === 'clean-runtime/runtime-markers' ||
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
    for (const source of [BASE, STRICT, PATHS, KEYS, CYCLES]) {
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
            // Under this option `import { type X } from` still loads the module.
            verbatimModuleSyntax: true,
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
      'product/capabilities/labels/client/inline-type.ts':
        "'use client'\nimport { type listLabels } from '../server.js'\nexport type Local = typeof listLabels",
      'product/capabilities/labels/client/declared-type.ts':
        "'use client'\nimport type { listLabels } from '../server.js'\nexport type Local = typeof listLabels",
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

    const portableMessages = (suffix) =>
      portableResults.find((result) => result.filePath.endsWith(path.join(...suffix)))?.messages ?? []
    if (!portableMessages(['labels', 'client', 'inline-type.ts']).some((message) => message.messageId === 'browserServer')) {
      errors.push('verbatimModuleSyntax: an inline type specifier was read as an erased edge')
    }
    if (portableMessages(['labels', 'client', 'declared-type.ts']).some((message) => message.messageId === 'browserServer')) {
      errors.push('verbatimModuleSyntax: a declaration-level import type was read as a runtime edge')
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

    sandboxSummary = `${clean.size} clean fixtures, ${expectedBase.size} boundary mutations, ${expectedStrict.size + expectedMarkers.size + 8} resolver/cycle/marker/portability canaries`
  } finally {
    process.chdir(previousCwd)
    fs.rmSync(sandbox, { recursive: true, force: true })
    fs.rmSync(sibling, { recursive: true, force: true })
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

// A classification the contract does not carry is an inactive rule, not an empty one: a contract
// copied before the key existed must stop the tools instead of passing them with nothing to check.
for (const key of ['purePackages', 'providerPackages', 'serverPackages', 'channelSurfaces']) {
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'missing-contract-key-')))
  try {
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{"private":true,"type":"module"}\n')
    fs.mkdirSync(path.join(sandbox, 'rules'))
    const { [key]: _removed, ...partial } = JSON.parse(fs.readFileSync(path.join(root, CONTRACT), 'utf8'))
    fs.writeFileSync(path.join(sandbox, 'rules/architecture-contract.json'), `${JSON.stringify(partial)}\n`)
    try {
      loadArchitecturePaths(import.meta.url, sandbox)
      errors.push(`a contract without ${key} was accepted`)
    } catch (error) {
      if (!String(error.message).includes(`${key} must be an array of strings`)) {
        errors.push(`a contract without ${key} failed for the wrong reason: ${error.message}`)
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
for (const [label, source] of [
  ['import type node', "type Offer = import('@/modules/a/contracts').Offer\n"],
  ['typeof import type node', "type Messages = keyof typeof import('@/modules/a/contracts')\n"],
]) {
  const parsed = ts.createSourceFile(`${label}.ts`, source, ts.ScriptTarget.Latest, true)
  const edges = moduleEdges(parsed)
  if (!edges.some((edge) => edge.specifier === '@/modules/a/contracts' && edge.typeOnly)) {
    errors.push(`${label} was not extracted as a type-only edge`)
  }
}
// A package `imports` mapping can name different files for `import` and `require`. The rules must
// follow the one the edge loads, or they inspect a file the runtime never opens.
{
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'resolution-mode-')))
  try {
    fs.mkdirSync(path.join(project, 'rules'))
    fs.mkdirSync(path.join(project, 'src'))
    // The entries a loaded file is tested against: an entry point is named by the contract entry
    // that loads the same file, not by how the import spells it.
    const shippedContract = JSON.parse(fs.readFileSync(path.join(root, CONTRACT), 'utf8'))
    fs.writeFileSync(
      path.join(project, 'rules/architecture-contract.json'),
      `${JSON.stringify({
        ...shippedContract,
        serverPackages: [...shippedContract.serverPackages, 'entry-sdk/schema', 'pg-real/sub', 'store-sdk/server', 'same-sdk/schema', 'dual-sdk/server', '@acme/dual/server', 'native-edge/schema', 'alias-driver/server', 'plain-driver/server', 'guarded/schema', 'entry-sdk/missing', 'typed-versions/server', 'null-driver/server', 'outward/server', '@acme/inner/server', 'cased/server', 'ancestor-sdk/metadata', 'legacy-sdk/server', 'legacy-escaped/server'],
      })}\n`
    )
    fs.writeFileSync(
      path.join(project, 'package.json'),
      `${JSON.stringify({
        private: true,
        type: 'module',
        // The project is itself a package named like one it has installed.
        name: 'selfsame',
        exports: { './server': './src/for-import.ts' },
        imports: {
          '#target': { import: './src/for-import.ts', require: './src/for-require.ts' },
          '#bridge': { types: './types/bridge.d.ts', default: './lib/bridge.mjs' },
          '#driver': 'typescript',
          '#subpath': 'typescript/lib/typescript.js',
          '#ts/*': 'typescript/*',
          '#schema': { import: 'typescript', require: 'acorn' },
          '#entry': { import: 'entry-sdk/schema', require: 'entry-sdk/io' },
          '#linked': 'linked',
          '#fs': 'fs/promises',
          '#rawfs': 'fs',
          '#typedfs': { types: './types/bridge.d.ts', default: 'fs/promises' },
          '#optfs': { 'opt-in': 'os', import: './src/for-import.ts', require: null },
          '#node/*': 'node:*',
          '#library': 'nullish',
          '#crafted': './.node-builtin/0.ts',
          '#choice': { import: 'buffer', types: 'os' },
          '#typed-versioned': 'typed-versions/server',
          '#same': { import: 'same-sdk/schema', require: 'same-sdk/io' },
          '#pk/*': 'acorn',
          '#pk/*.lib': 'typescript/lib/*.js',
          '#edge': { types: './src/modules/first/types.d.ts', default: './src/modules/second/server.ts' },
        },
      })}\n`
    )
    fs.mkdirSync(path.join(project, 'node_modules'))
    for (const name of ['typescript', 'acorn']) {
      fs.symlinkSync(path.join(root, 'node_modules', name), path.join(project, 'node_modules', name), 'dir')
    }
    for (const [directory, manifest, files] of [
      ['entry-sdk', { name: 'entry-sdk', exports: { './schema': './schema.js', './io': './io.js' } }, ['schema.js', 'io.js', 'build/addon.node']],
      ['db', { name: 'pg-real', exports: { '.': './index.js', './sub': './sub.js' } }, ['index.js', 'sub.js']],
      ['.store/store-sdk@1.0.0/node_modules/store-sdk', { name: 'store-sdk', exports: { './server': './server.js' } }, ['server.js']],
      ['../packages/linked', { name: 'linked', main: 'index.js' }, ['index.js']],
      ['fs', { name: 'fs' }, ['index.js']],
      // The same package twice: at the top and inside another package, each its own file.
      ['dual-sdk', { name: 'dual-sdk' }, ['index.js', 'server.js']],
      ['wrapper/node_modules/dual-sdk', { name: 'dual-sdk' }, ['index.js', 'server.js']],
      // A package installed under another name that holds a copy of the package it is named as.
      ['outer', { name: '@acme/dual', exports: { './server': './server.js' } }, ['server.js']],
      ['outer/node_modules/@acme/dual', { name: '@acme/dual', exports: { './server': './server.js' } }, ['server.js']],
      ['native-edge', { name: 'native-edge', exports: { './schema': './schema.js', './io': './io.js' } }, ['schema.js', 'io.js']],
      // A package installed under an alias that depends on another version of itself under the
      // same alias, with an export map and without one.
      ['driver-alias', { name: 'alias-driver', exports: { './server': './server.js' } }, ['server.js']],
      ['driver-alias/node_modules/driver-alias', { name: 'alias-driver', exports: { './server': './server.js' } }, ['server.js']],
      ['plain-alias', { name: 'plain-driver' }, ['index.js', 'server.js']],
      ['plain-alias/node_modules/plain-alias', { name: 'plain-driver' }, ['index.js', 'server.js']],
      // Declarations whose subpaths `typesVersions` redirects, with a decoy where the path would point.
      [
        '@types/typed-versions',
        { name: '@types/typed-versions', typesVersions: { '*': { server: ['types/server.d.ts'] } } },
        ['types/server.d.ts', 'server.d.ts'],
      ],
      // An entry whose declaration lives in a sibling package, with a fallback beside it that
      // the real installation never loads.
      ['outward', { name: 'outward' }, ['index.js', 'server/index.d.ts']],
      ['outward-types', { name: 'outward-types' }, ['server.d.ts']],
      ['cased', { name: 'cased' }, ['index.js', 'server.js']],
      ['selfsame', { name: 'selfsame', exports: { './server': './server.js' } }, ['server.js']],
      // A package that ships JavaScript and redirects the same subpath's declaration elsewhere.
      [
        'legacy-sdk',
        { name: 'legacy-sdk', typesVersions: { '*': { server: ['types/server.d.ts'] } } },
        ['index.js', 'server.js', 'types/server.d.ts'],
      ],
      // A generated manifest that writes `null` for a field it does not use.
      ['nullish', { name: 'nullish', main: 'main.js', imports: null }, ['main.js']],
      // An entry whose `main` is the manifest of the project that holds the package.
      ['ancestor-sdk', { name: 'ancestor-sdk' }, ['index.js', 'metadata/index.js']],
      // `exports: null` is no export map; the package also holds a package named as it is.
      ['null-alias', { name: 'null-driver', exports: null }, ['server.js']],
      ['null-alias/node_modules/null-driver', { name: 'null-driver' }, ['server.js']],
      // An export map decides what an entry is: `./schema` is lib/schema.js, not the file beside the manifest.
      ['guarded', { name: 'guarded', exports: { './schema': './lib/schema.js' } }, ['lib/schema.js', 'schema.js']],
      // Two public subpaths that load the same file under each condition are one entry point.
      [
        'same-sdk',
        {
          name: 'same-sdk',
          exports: {
            './schema': { import: './schema.mjs', require: './io.cjs' },
            './io': { import: './schema.mjs', require: './io.cjs' },
          },
        },
        ['schema.mjs', 'io.cjs'],
      ],
    ]) {
      for (const relative of files) {
        fs.mkdirSync(path.dirname(path.join(project, 'node_modules', directory, relative)), { recursive: true })
        fs.writeFileSync(path.join(project, 'node_modules', directory, relative), 'export {}\n')
      }
      fs.writeFileSync(path.join(project, 'node_modules', directory, 'package.json'), `${JSON.stringify({ version: '1.0.0', ...manifest })}\n`)
    }
    fs.symlinkSync(path.join(project, 'node_modules/.store/store-sdk@1.0.0/node_modules/store-sdk'), path.join(project, 'node_modules/store-alias'), 'dir')
    fs.symlinkSync(path.join(project, 'packages/linked'), path.join(project, 'node_modules/linked'), 'dir')
    fs.writeFileSync(path.join(project, 'node_modules/outward/server/package.json'), '{"types":"../../outward-types/server.d.ts"}\n')
    fs.writeFileSync(path.join(project, 'node_modules/ancestor-sdk/metadata/package.json'), '{"main":"../../../package.json"}\n')
    // The same redirection with the key spelled through an escape, which JSON reads as the key.
    for (const relative of ['server.js', 'types/server.d.ts']) {
      fs.mkdirSync(path.dirname(path.join(project, 'node_modules/legacy-escaped', relative)), { recursive: true })
      fs.writeFileSync(path.join(project, 'node_modules/legacy-escaped', relative), 'export {}\n')
    }
    fs.writeFileSync(
      path.join(project, 'node_modules/legacy-escaped/package.json'),
      '{"name":"legacy-escaped","version":"1.0.0","types\\u0056ersions":{"*":{"server":["types/server.d.ts"]}}}\n'
    )
    // A linked workspace package in which two names lead to one file.
    fs.mkdirSync(path.join(project, 'packages/inner'))
    fs.writeFileSync(path.join(project, 'packages/inner/package.json'), '{"name":"@acme/inner","version":"1.0.0"}\n')
    fs.writeFileSync(path.join(project, 'packages/inner/server.js'), 'export {}\n')
    fs.symlinkSync(path.join(project, 'packages/inner/server.js'), path.join(project, 'packages/inner/alternate.js'))
    fs.mkdirSync(path.join(project, 'node_modules/@acme'), { recursive: true })
    fs.symlinkSync(path.join(project, 'packages/inner'), path.join(project, 'node_modules/@acme/inner'), 'dir')
    // A workspace package without a version, linked under another name.
    fs.mkdirSync(path.join(project, 'packages/bare'))
    fs.writeFileSync(path.join(project, 'packages/bare/package.json'), '\uFEFF{"name":"bare-real","main":"index.js"}\n')
    fs.writeFileSync(path.join(project, 'packages/bare/index.js'), 'export {}\n')
    fs.symlinkSync(path.join(project, 'packages/bare'), path.join(project, 'node_modules/bare-alias'), 'dir')
    fs.mkdirSync(path.join(project, 'types'))
    fs.mkdirSync(path.join(project, 'lib'))
    fs.writeFileSync(path.join(project, 'types/bridge.d.ts'), 'export declare const bridged: 1\n')
    // A `paths` candidate that leads nowhere but is a manifest with builtin targets of its own.
    fs.mkdirSync(path.join(project, 'aliases/choice'), { recursive: true })
    fs.writeFileSync(path.join(project, 'aliases/choice/package.json'), '{"imports":{"#x":"fs"}}\n')
    // A real file where a builtin's marker would otherwise be allocated.
    fs.mkdirSync(path.join(project, '.node-builtin'))
    fs.writeFileSync(path.join(project, '.node-builtin/0.ts'), 'export const real = 1\n')
    fs.writeFileSync(path.join(project, 'lib/bridge.mjs'), 'export const bridged = 1\n')
    fs.writeFileSync(path.join(project, 'src/declared.js'), 'export const declared = 1\n')
    fs.writeFileSync(path.join(project, 'src/declared.d.ts'), 'export declare const declared: 1\n')
    fs.writeFileSync(path.join(project, 'tsconfig.json'), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","verbatimModuleSyntax":true,"paths":{"@vendor/*":["./node_modules/*"],"@nested/*":["./node_modules/wrapper/node_modules/*"],"@scoped/*":["./node_modules/outer/node_modules/*"],"dual-sdk/server":["./node_modules/dual-sdk/server.js"],"native-edge/schema":["./node_modules/native-edge/io.js"],"#choice":["./aliases/choice"],"@src/*":["./src/*"],"@exact":["./src/main-module"],"@suffix/*/entry":["./src/*"],"@slash":["./src/main-module/"]}}}\n')
    fs.writeFileSync(path.join(project, 'src/for-import.ts'), 'export const loaded = 1\n')
    fs.writeFileSync(path.join(project, 'src/for-require.ts'), 'export const loaded = 2\n')
    const projectPaths = loadArchitecturePaths(import.meta.url, project)
    const importer = path.join(project, 'src/entry.mts')
    const targets = (specifier, options, from = importer) =>
      resolveEdgeTargets(projectPaths, from, specifier, options)
        .map((target) =>
          target.ambiguous
            ? `ambiguous:${target.ambiguous.map((file) => path.basename(file)).sort().join('|')}`
            : target.file
              ? path.basename(target.file)
              : `package:${[...target.names].sort().join('+')}${target.aliases?.size ? `(as ${[...target.aliases].sort().join('+')})` : ''}${target.byPath ? '(by path)' : ''}`
        )
        .sort()
        .join()
    // Which condition a runtime picks depends on how the edge is written, on the importing file
    // and on an explicit resolution mode. The rules do not guess: a specifier that names
    // different project files for `import` and for `require` is reported as ambiguous.
    for (const [specifier, options, expected] of [
      ['#target', {}, 'ambiguous:for-import.ts|for-require.ts'],
      ['#target', { typeOnly: true }, 'ambiguous:for-import.ts|for-require.ts'],
      // A value edge loads the implementation; only a type edge reads the declaration, wherever a
      // `types` condition or a neighbouring file puts it.
      ['#bridge', {}, 'bridge.mjs'],
      ['#bridge', { typeOnly: true }, 'bridge.d.ts'],
      ['./declared.js', {}, 'declared.js'],
      ['./declared.js', { typeOnly: true }, 'declared.d.ts'],
      // A package reached through an alias keeps its own name, which is what the contract classifies.
      ['#driver', {}, 'package:typescript'],
      // A package answers to its own name, however the specifier or an alias target spells the
      // file inside it; an entry point is named only by a contract entry that loads that file.
      ['#subpath', {}, 'package:typescript'],
      ['#ts/lib/typescript.js', {}, 'package:typescript'],
      // A path into node_modules names a file, not an entry point, so the target says so and the
      // rule refuses it instead of classifying a package it cannot fully identify.
      ['../node_modules/typescript/lib/typescript.js', {}, 'package:typescript(by path)'],
      // Two packages behind one alias are two targets: one that is classified cannot answer for
      // the other. So are two entry points of one package, of which the contract names one.
      ['#schema', {}, 'package:acorn,package:typescript'],
      ['#entry', {}, 'package:entry-sdk,package:entry-sdk+entry-sdk/schema'],
      ['entry-sdk/schema', {}, 'package:entry-sdk+entry-sdk/schema'],
      ['entry-sdk/io', {}, 'package:entry-sdk'],
      // A package installed under another name is the package its manifest names, entry point
      // included; the installed name is kept apart, as the project's spelling of it.
      ['db', {}, 'package:pg-real(as db)'],
      ['db/sub', {}, 'package:pg-real+pg-real/sub(as db)'],
      // A package linked out of a store is installed under the link's name and named by its own
      // manifest; a linked workspace package is a package although its real path has no node_modules.
      ['store-alias/server', {}, 'package:store-sdk+store-sdk/server(as store-alias)'],
      ['#linked', {}, 'package:linked'],
      ['linked', {}, 'package:linked'],
      // The manifest names the package whether or not it carries a version.
      ['bare-alias', {}, 'package:bare-real(as bare-alias)'],
      // A `paths` mapping into node_modules loads the entry point's file, so it is that entry
      // point; a relative path is too, and is refused for being a path.
      ['@vendor/entry-sdk/schema.js', {}, 'package:entry-sdk+entry-sdk/schema'],
      ['../node_modules/entry-sdk/schema.js', {}, 'package:entry-sdk+entry-sdk/schema(by path)'],
      // A classified specifier names whatever it loads under each condition. Here the alias loads,
      // in either mode, the file the classified entry loads in that mode.
      ['#same', {}, 'package:same-sdk+same-sdk/schema'],
      ['same-sdk/schema', {}, 'package:same-sdk+same-sdk/schema'],
      // A path into node_modules is refused even where TypeScript cannot resolve the file.
      ['../node_modules/entry-sdk/build/addon.node', {}, 'package:entry-sdk(by path)'],
      // Among patterns with the same prefix the longer key wins, as in Node's own matching.
      ['#pk/typescript.lib', {}, 'package:typescript'],
      ['acorn', { typeOnly: true }, 'package:acorn'],
      ['typescript', {}, 'package:typescript'],
      ['not-installed/sub', {}, 'package:not-installed/sub'],
      ['fs/promises', {}, 'package:fs/promises+node:fs/promises'],
      // `typesVersions` redirects declarations; what a value edge loads is the JavaScript.
      ['legacy-sdk/server', {}, 'package:legacy-sdk+legacy-sdk/server'],
      ['legacy-sdk/server.js', {}, 'package:legacy-sdk+legacy-sdk/server'],
      ['legacy-sdk/server', { typeOnly: true }, 'package:legacy-sdk+legacy-sdk/server'],
      ['legacy-escaped/server.js', {}, 'package:legacy-escaped+legacy-escaped/server'],
      // An alias whose target is a builtin is that builtin, installed namesake or not.
      ['#fs', {}, 'package:#fs+node:fs/promises'],
      ['#rawfs', {}, 'package:#rawfs+node:fs'],
      ['#node/fs', {}, 'package:#node/fs+node:fs'],
      ['#library', {}, 'package:nullish'],
      // The value pass and the declaration pass may read manifests a different number of times;
      // a builtin is still the one its own pass selected.
      ['#choice', {}, 'package:#choice+node:buffer,package:#choice+node:os'],
      // A real file is never taken for a builtin's marker: the marker is allocated beside it.
      ['#crafted', {}, '0.ts'],
      // The branch a mode selects decides: a declaration beside a builtin does not hide it from
      // a value edge, and a builtin under a condition that is not active is not there.
      ['#typedfs', {}, 'package:#typedfs+node:fs/promises'],
      ['#typedfs', { typeOnly: true }, 'bridge.d.ts'],
      ['#optfs', {}, 'for-import.ts'],
      // Node loads the builtin for a builtin's name whatever is installed under it.
      ['fs', {}, 'package:fs+node:fs'],
      // A contract entry is asked of the copy of the package that supplied the file.
      ['@nested/dual-sdk/server.js', {}, 'package:dual-sdk+dual-sdk/server'],
      ['dual-sdk/server.js', {}, 'package:dual-sdk+dual-sdk/server'],
      // ...and of that copy's own manifest: neither the name of the package that holds it nor a
      // `paths` mapping of the entry's spelling can send the question elsewhere.
      ['@scoped/@acme/dual/server.js', {}, 'package:@acme/dual+@acme/dual/server'],
      // An entry is asked of the copy that supplied the file even when that copy holds another
      // one under the very name it is installed as.
      ['driver-alias/server', {}, 'package:alias-driver+alias-driver/server(as driver-alias)'],
      ['plain-alias/server.js', {}, 'package:plain-driver+plain-driver/server(as plain-alias)'],
      // The entry is whatever TypeScript's own package resolution makes of it in that copy:
      // `typesVersions` redirects it, and `exports: null` is no export map.
      ['#typed-versioned', { typeOnly: true }, 'package:typed-versions+typed-versions/server'],
      ['typed-versions/server', { typeOnly: true }, 'package:typed-versions+typed-versions/server'],
      ['null-alias/server.js', {}, 'package:null-driver+null-driver/server(as null-alias)'],
      // What an entry reaches outside its own directory is there in a real installation, so it
      // is there when the entry is asked: the fallback beside the manifest is not the entry.
      ['@vendor/outward/server/index.d.ts', { typeOnly: true }, 'package:outward'],
      // ...including a manifest above the package, which is a file like any other.
      ['@vendor/ancestor-sdk/metadata/index.js', {}, 'package:ancestor-sdk'],
      // One file is one file, by whichever link inside the package it is reached.
      ['@acme/inner/alternate.js', {}, 'package:@acme/inner+@acme/inner/server'],
      // Where an export map governs, a file it does not export under the entry is not the entry.
      ['guarded/schema', {}, 'package:guarded+guarded/schema'],
      ['@vendor/guarded/schema.js', {}, 'package:guarded'],
      // A contract entry names what the package exports under it. A compiler mapping of that
      // spelling to another file gives the other file no claim to the entry.
      ['native-edge/io', {}, 'package:native-edge'],
      ['native-edge/schema', {}, 'package:native-edge'],
      ['node:fs', {}, 'package:node:fs'],
    ]) {
      if (targets(specifier, options) !== expected) {
        errors.push(`${specifier} ${JSON.stringify(options)} resolved ${targets(specifier, options)}; expected ${expected}`)
      }
    }
    const edges = moduleEdges(ts.createSourceFile('edges.cts', "const a = require('./a')\nimport b = require('./b')\nconst c = import('./c')\n", ts.ScriptTarget.Latest, true))
    // A directory a bundler enters through `module`: both readers get the file it names.
    fs.mkdirSync(path.join(project, 'src/esm-entry'))
    fs.writeFileSync(path.join(project, 'src/esm-entry/package.json'), '{"module":"./run.js"}\n')
    fs.writeFileSync(path.join(project, 'src/esm-entry/run.ts'), 'export {}\n')
    if (targets('./esm-entry', {}) !== 'run.ts') errors.push(`a directory entered through module resolved ${targets('./esm-entry', {})}; expected run.ts`)
    // Fields that name different files are different answers for different builds; a type edge
    // reads none of them.
    for (const [directory, manifest] of [
      ['main-module', { main: './a.js', module: './b.js' }],
      ['browser-module', { browser: './a.js', module: './b.js' }],
      ['agreeing', { main: './a.js', module: './a.js' }],
      // `main` leads out of the directory; the bundler's field stays inside it.
      ['outward-main', { main: '../for-import.ts', module: './b.js' }],
    ]) {
      fs.mkdirSync(path.join(project, 'src', directory))
      fs.writeFileSync(path.join(project, 'src', directory, 'package.json'), `${JSON.stringify(manifest)}\n`)
      for (const name of ['a.ts', 'b.ts']) fs.writeFileSync(path.join(project, 'src', directory, name), 'export {}\n')
    }
    fs.mkdirSync(path.join(project, 'src/suffixed-entry'))
    fs.writeFileSync(path.join(project, 'src/suffixed-entry/package.json'), '{"main":"./a.js","module":"./b.ts"}\n')
    for (const name of ['a.ts', 'b.ts']) fs.writeFileSync(path.join(project, 'src/suffixed-entry', name), 'export {}\n')
    fs.mkdirSync(path.join(project, 'src/typed-entry'))
    fs.writeFileSync(path.join(project, 'src/typed-entry/package.json'), '{"types":"./worker.d.ts","module":"./worker.js"}\n')
    fs.writeFileSync(path.join(project, 'src/typed-entry/worker.d.ts'), 'export {}\n')
    fs.writeFileSync(path.join(project, 'src/typed-entry/worker.js'), 'export {}\n')
    // An alias that names the directory with a trailing slash, used from inside that directory:
    // the manifest is then also one of the importing file's own package scopes.
    const fromInside = targets('@slash', {}, path.join(project, 'src/main-module/inner.ts'))
    if (fromInside !== 'ambiguous:a.ts|b.ts') errors.push(`a directory-only alias used from inside resolved ${fromInside}; expected ambiguous:a.ts|b.ts`)
    // ...while an ordinary import from inside that directory enters nothing.
    const sibling = targets('./a.js', {}, path.join(project, 'src/main-module/inner.ts'))
    if (sibling !== 'a.ts') errors.push(`a sibling import inside a directory with bundler entries resolved ${sibling}; expected a.ts`)
    for (const [specifier, options, expected] of [
      ['./main-module', {}, 'ambiguous:a.ts|b.ts'],
      ['./main-module', { typeOnly: true }, 'a.ts'],
      ['./browser-module', {}, 'ambiguous:a.ts|b.ts'],
      ['./agreeing', {}, 'a.ts'],
      // The directory that counts is the one the request enters, wherever TypeScript's answer
      // lies and however the request is spelled.
      ['./outward-main', {}, 'ambiguous:b.ts|for-import.ts'],
      ['@src/main-module', {}, 'ambiguous:a.ts|b.ts'],
      ['@src/agreeing', {}, 'a.ts'],
      // An alias with no wildcard, one with the wildcard in the middle, and a trailing slash.
      ['@exact', {}, 'ambiguous:a.ts|b.ts'],
      ['@suffix/main-module/entry', {}, 'ambiguous:a.ts|b.ts'],
      ['./main-module/', {}, 'ambiguous:a.ts|b.ts'],
      // A declaration the manifest names is no second runtime file beside the one in module.
      ['./typed-entry', {}, 'worker.js'],
      ['./typed-entry', { typeOnly: true }, 'worker.d.ts'],
    ]) {
      if (targets(specifier, options) !== expected) {
        errors.push(`${specifier} ${JSON.stringify(options)} resolved ${targets(specifier, options)}; expected ${expected}`)
      }
    }
    fs.mkdirSync(path.join(project, 'src/rooted'))
    fs.writeFileSync(path.join(project, 'src/rooted/index.ts'), 'export {}\n')
    // The cycle checker reads the same edges as lint: a module a bundler loads through a URL
    // relative to the importing module is one of them, an absolute URL and a computed one are not.
    const urlEdges = moduleEdges(
      ts.createSourceFile(
        'worker.ts',
        [
          "new Worker(new URL('../fourth/worker.js', import.meta.url))",
          "new Worker(new URL('local.js?worker', import.meta['url']))",
          "new URL('https://example.test/x.js', import.meta.url)",
          "new URL('/x.js', import.meta.url)",
          'new URL(name, import.meta.url)',
          "new URL('./plain.js', base)",
          "new URL('./cast.js' as const, import.meta.url as string)",
          "new URL('./subclass.js', new.target.url)",
          "new URL('/src/for-import.ts', import.meta.url)",
          "new URL('/public-only.js', import.meta.url)",
          "new (URL)('./paren.js', import.meta['url' as const])",
          "new URL('/src/rooted', import.meta.url)",
          "new URL('/src/rooted/', import.meta.url)",
          "new URL('/src/esm-entry', import.meta.url)",
        ].join('\n'),
        ts.ScriptTarget.Latest,
        true
      ),
      { ...projectPaths, importer: path.join(project, 'src/modules/third/worker.ts') }
    )
    if (urlEdges.map((edge) => edge.specifier).join() !== '../fourth/worker.js,./local.js,./cast.js,../../for-import.ts,./paren.js,../../rooted,../../rooted/,../../esm-entry') {
      errors.push(`URL edges were not extracted as lint reads them: ${JSON.stringify(urlEdges)}`)
    }
    // An alias belongs to the package scope of the file that uses it, not to the project root.
    fs.mkdirSync(path.join(project, 'src/nested'))
    fs.writeFileSync(path.join(project, 'src/nested/package.json'), '{"type":"module","imports":{"#driver":"acorn"}}\n')
    const nested = targets('#driver', {}, path.join(project, 'src/nested/entry.mts'))
    if (nested !== 'package:acorn') errors.push(`an alias in a nested package scope resolved ${nested}; expected package:acorn`)
    // A name the outer package resolves to itself is the installed package from a scope that is
    // not that package; an answer remembered for one directory is not an answer for another.
    const own = targets('selfsame/server', {})
    const installed = targets('selfsame/server', {}, path.join(project, 'src/nested/entry.mts'))
    if (own !== 'for-import.ts' || installed !== 'package:selfsame') {
      errors.push(`a self reference and the installed namesake resolved ${own} and ${installed}; expected for-import.ts and package:selfsame`)
    }
    // Every edge of a declaration file is a type edge, whatever it is written as.
    const declared = moduleEdges(ts.createSourceFile('actions.d.ts', "export { save } from './impl.js'\n", ts.ScriptTarget.Latest, true))
    if (declared.some((edge) => !edge.typeOnly)) errors.push('an edge of a declaration file was read as a runtime edge')
    // The cycle checker reads the same edges. Under `verbatimModuleSyntax` an inline type import
    // still loads the module, and what it loads is the implementation in the other capability,
    // not the declaration beside the importer.
    for (const source of [PATHS, KEYS, CYCLES]) {
      fs.copyFileSync(path.join(root, source), path.join(project, 'rules', path.basename(source)))
    }
    for (const [relative, source] of [
      ['src/modules/first/types.d.ts', 'export type Second = { id: string }\n'],
      ['src/modules/first/server.ts', "import { type Second } from '#edge'\nexport type Local = Second\n"],
      ['src/modules/second/server.ts', "import '../first/server.js'\nexport type Second = { id: string }\n"],
    ]) {
      fs.mkdirSync(path.dirname(path.join(project, relative)), { recursive: true })
      fs.writeFileSync(path.join(project, relative), source)
    }
    const hiddenCycle = spawnSync(process.execPath, [path.join(project, 'rules', path.basename(CYCLES))], { cwd: project, encoding: 'utf8' })
    if (hiddenCycle.status === 0 || !`${hiddenCycle.stdout}${hiddenCycle.stderr}`.includes('first -> second -> first')) {
      errors.push(`a cycle through an inline type import under verbatimModuleSyntax was missed: ${hiddenCycle.stdout}${hiddenCycle.stderr}`.trim())
    }
    // However an edge is written, it is an edge: the form no longer selects a resolution mode.
    if (edges.map((edge) => edge.specifier).join() !== './a,./b,./c') {
      errors.push(`require and import() edges were not all extracted: ${JSON.stringify(edges)}`)
    }
    // On a filesystem that ignores case TypeScript keeps the spelling it was asked with, and the
    // file is the same file.
    if (fs.existsSync(path.join(project, 'PACKAGE.JSON'))) {
      const cased = targets('cased/SERVER.js', {})
      if (cased !== 'package:cased+cased/server') errors.push(`cased/SERVER.js resolved ${cased}; expected package:cased+cased/server`)
    }
    // A project that turns export maps off loads an entry as a path, and the entry is asked the
    // same way: by the project's own resolution, whatever it is set to.
    const entryCases = [
      ['guarded/schema', 'package:guarded+guarded/schema'],
      ['driver-alias/server', 'package:alias-driver+alias-driver/server(as driver-alias)'],
    ]
    for (const [label, options, cases] of [
      ['node10', { module: 'CommonJS', moduleResolution: 'Node10' }, entryCases],
      ['exports off', { module: 'ESNext', moduleResolution: 'Bundler', resolvePackageJsonExports: false }, entryCases],
      // A builtin is named by the alias target, not by a file name the project's suffixes try.
      [
        'moduleSuffixes',
        { module: 'NodeNext', moduleResolution: 'NodeNext', moduleSuffixes: ['.server', ''] },
        [
          ['#rawfs', 'package:#rawfs+node:fs'],
          ['#fs', 'package:#fs+node:fs/promises'],
        ],
      ],
      [
        'suffixes cleared',
        { module: 'NodeNext', moduleResolution: 'NodeNext', moduleSuffixes: [] },
        [
          ['#rawfs', 'package:#rawfs+node:fs'],
          ['#typedfs', 'package:#typedfs+node:fs/promises'],
        ],
      ],
      [
        'suffix only',
        { module: 'NodeNext', moduleResolution: 'NodeNext', moduleSuffixes: ['.server'] },
        [
          ['#rawfs', 'package:#rawfs+node:fs'],
          ['#typedfs', 'package:#typedfs+node:fs/promises'],
          // The marker by which a directory is known to be entered exists under the suffix too:
          // with no `a.server` file TypeScript finds nothing, and the bundler's field still counts.
          ['./suffixed-entry', 'b.ts'],
        ],
      ],
      // A project that keeps links apart loads each as its own module, so each is its own file.
      [
        'preserveSymlinks',
        { module: 'NodeNext', moduleResolution: 'NodeNext', preserveSymlinks: true },
        [
          ['@acme/inner/server.js', 'package:@acme/inner+@acme/inner/server'],
          ['@acme/inner/alternate.js', 'package:@acme/inner'],
        ],
      ],
    ]) {
      fs.writeFileSync(path.join(project, 'tsconfig.json'), `${JSON.stringify({ compilerOptions: options })}\n`)
      const otherPaths = loadArchitecturePaths(import.meta.url, project)
      for (const [specifier, expected] of cases) {
        const [target] = resolveEdgeTargets(otherPaths, importer, specifier)
        const got = target.file
          ? path.basename(target.file)
          : `package:${[...(target.names ?? [])].sort().join('+')}${target.aliases?.size ? `(as ${[...target.aliases].sort().join('+')})` : ''}`
        if (got !== expected) errors.push(`${specifier} under ${label} resolved ${got}; expected ${expected}`)
      }
    }
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
}
{
  const parsed = ts.createSourceFile('inline.ts', "import { type A } from '@/modules/a/server'\nexport { type B } from '@/modules/b/server'\n", ts.ScriptTarget.Latest, true)
  if (moduleEdges(parsed).some((edge) => !edge.typeOnly)) errors.push('an inline type specifier was a value edge without verbatimModuleSyntax')
  if (moduleEdges(parsed, { verbatimModuleSyntax: true }).some((edge) => edge.typeOnly)) {
    errors.push('an inline type specifier was erased under verbatimModuleSyntax')
  }
}
{
  const parsed = ts.createSourceFile('ordinary-method.ts', "loader.require('@/not-an-edge')\n", ts.ScriptTarget.Latest, true)
  if (moduleSpecifiers(parsed).length > 0) errors.push('ordinary require method was classified as a module edge')
}

fail(errors)
console.log(`rules ok (${sandboxSummary})`)
