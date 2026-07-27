import type { CreateWorkItemInput, WorkItem } from '../domain/work-item.js'

export type WorkItemRow = {
  id: string
  tenant_id: string
  title: string
  description: string | null
  is_priority: boolean
  created_at: string
  updated_at: string
}

export type WorkItemDataSource = {
  selectByTenant(tenantId: string): Promise<WorkItemRow[]>
  insert(row: WorkItemRow): Promise<WorkItemRow>
}

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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
        created_at: now,
        updated_at: now,
      })
      return toWorkItem(row)
    },
  }
}

export function createMemoryWorkItemSource(seed: WorkItemRow[] = []): WorkItemDataSource {
  const rows = seed.map((row) => ({ ...row }))
  return {
    async selectByTenant(tenantId) {
      return rows.filter((row) => row.tenant_id === tenantId).map((row) => ({ ...row }))
    },
    async insert(row) {
      rows.push({ ...row })
      return { ...row }
    },
  }
}
