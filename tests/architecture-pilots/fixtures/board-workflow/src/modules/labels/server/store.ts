import type { Label } from '../domain/label.js'

export type LabelsStore = {
  list(tenantId: string): Promise<Label[]>
}

export function createMemoryLabelsStore(labels: Label[]): LabelsStore {
  return {
    async list() {
      return labels.map((label) => ({ ...label }))
    },
  }
}
