import type { Label } from './domain/label.js'

export type LabelsSource = {
  list(tenantId: string): Promise<Label[]>
}

export type LabelSummary = {
  id: string
  name: string
}

export type LabelsServer = {
  listForBoard(tenantId: string): Promise<LabelSummary[]>
}

export function createLabelsServer(store: LabelsSource): LabelsServer {
  return {
    async listForBoard(tenantId) {
      return (await store.list(tenantId)).map(({ id, name }) => ({ id, name }))
    },
  }
}
