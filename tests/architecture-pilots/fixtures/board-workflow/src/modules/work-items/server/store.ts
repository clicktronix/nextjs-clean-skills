import type { WorkItem } from '../domain/work-item.js'

export type WorkItemsStore = {
  list(tenantId: string): Promise<WorkItem[]>
}

export function createMemoryWorkItemsStore(items: WorkItem[]): WorkItemsStore {
  return {
    async list() {
      return items.map((item) => ({ ...item, labelIds: [...item.labelIds] }))
    },
  }
}
