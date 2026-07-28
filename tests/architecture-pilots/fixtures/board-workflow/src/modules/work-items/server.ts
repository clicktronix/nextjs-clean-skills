import type { WorkItem } from './domain/work-item.js'

export type WorkItemsSource = {
  list(tenantId: string): Promise<WorkItem[]>
}

export type WorkItemSummary = {
  id: string
  title: string
  labelIds: string[]
}

export type WorkItemsServer = {
  listForBoard(tenantId: string): Promise<WorkItemSummary[]>
}

export function createWorkItemsServer(store: WorkItemsSource): WorkItemsServer {
  return {
    async listForBoard(tenantId) {
      return (await store.list(tenantId)).map(({ id, title, labelIds }) => ({
        id,
        title,
        labelIds,
      }))
    },
  }
}
