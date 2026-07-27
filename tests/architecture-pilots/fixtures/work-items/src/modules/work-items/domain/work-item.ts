export type WorkItem = {
  id: string
  title: string
  description: string | null
  priority: boolean
  createdAt: string
  updatedAt: string
}

export type CreateWorkItemInput = {
  title: string
  description?: string | null
  priority?: boolean
}

export class WorkItemInputError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseCreateWorkItemInput(value: unknown): CreateWorkItemInput {
  if (!isRecord(value) || typeof value.title !== 'string' || value.title.trim().length === 0) {
    throw new WorkItemInputError('title is required')
  }
  if (
    value.description !== undefined &&
    value.description !== null &&
    typeof value.description !== 'string'
  ) {
    throw new WorkItemInputError('description must be a string or null')
  }
  if (value.priority !== undefined && typeof value.priority !== 'boolean') {
    throw new WorkItemInputError('priority must be a boolean')
  }

  return {
    title: value.title.trim(),
    description: value.description,
    priority: value.priority,
  }
}
