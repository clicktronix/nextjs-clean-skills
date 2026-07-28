import type { CreateWorkItemInput, WorkItem } from '../domain/work-item.js'

export type WorkItemRow = {
  id: string
  tenant_id: string
  title: string
  description: string | null
  is_priority: boolean
  due_at: string | null
  created_at: string
  updated_at: string
}

export type WorkItemDataSource = {
  selectByTenant(tenantId: string): Promise<WorkItemRow[]>
  insert(row: WorkItemRow): Promise<WorkItemRow>
}

export type WorkItemsFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export type WorkItemStore = {
  list(tenantId: string): Promise<WorkItem[]>
  create(tenantId: string, input: CreateWorkItemInput): Promise<WorkItem>
}

function toWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.is_priority,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseWorkItemRow(value: unknown): WorkItemRow {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.tenant_id !== 'string' ||
    typeof value.title !== 'string' ||
    (value.description !== null && typeof value.description !== 'string') ||
    typeof value.is_priority !== 'boolean' ||
    (value.due_at !== null && typeof value.due_at !== 'string') ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string'
  ) {
    throw new Error('work-item provider returned an invalid row')
  }
  return value as WorkItemRow
}

export function createWorkItemStore(source: WorkItemDataSource): WorkItemStore {
  return {
    async list(tenantId) {
      return (await source.selectByTenant(tenantId)).map(toWorkItem)
    },
    async create(tenantId, input) {
      const now = new Date(0).toISOString()
      const row = await source.insert({
        id: `work-item-${tenantId}-${input.title.toLowerCase().replaceAll(' ', '-')}`,
        tenant_id: tenantId,
        title: input.title,
        description: input.description ?? null,
        is_priority: input.priority ?? false,
        due_at: input.dueAt ?? null,
        created_at: now,
        updated_at: now,
      })
      return toWorkItem(row)
    },
  }
}

export function createHttpWorkItemSource({
  baseUrl,
  fetcher = fetch,
}: {
  baseUrl: string
  fetcher?: WorkItemsFetcher
}): WorkItemDataSource {
  return {
    async selectByTenant(tenantId) {
      const response = await fetcher(
        new URL(`/work-items?tenantId=${encodeURIComponent(tenantId)}`, baseUrl)
      )
      const body: unknown = await response.json()
      if (!response.ok || !Array.isArray(body)) {
        throw new Error(`work-item provider list failed with ${response.status}`)
      }
      return body.map(parseWorkItemRow)
    },
    async insert(row) {
      const response = await fetcher(new URL('/work-items', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(row),
      })
      const body: unknown = await response.json()
      if (response.status !== 201) {
        throw new Error(`work-item provider create failed with ${response.status}`)
      }
      return parseWorkItemRow(body)
    },
  }
}
