import type { WorkItem } from './work-item.js'

// The HTTP read contract has one owner. The handler under app/** builds its body with
// toWorkItemsResponse and the browser reads it with parseWorkItemsResponse at the published path,
// so a change to the path or the envelope is a change to this file and to nothing else.
export const WORK_ITEMS_PATH = '/api/work-items'

export type WorkItemsResponse = { data: WorkItem[]; requestId: string }

export class WorkItemsResponseError extends Error {}

// The body is written through the schema that reads it: only the fields the contract names leave
// the server, whatever else the object the store returned carries.
export function toWorkItemsResponse(items: WorkItem[], requestId: string): WorkItemsResponse {
  const fields = Object.keys(workItemFields) as (keyof WorkItem)[]
  const project = (item: WorkItem) =>
    Object.fromEntries(fields.map((field) => [field, item[field]])) as WorkItem
  return { data: items.map(project), requestId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

// One check per field of the product type. The mapped type makes that literal: a field added to
// WorkItem does not compile until the wire schema checks it, so the schema cannot keep accepting
// an older shape.
const workItemFields = {
  id: isString,
  title: isString,
  description: isNullableString,
  priority: isBoolean,
  dueAt: isNullableString,
  createdAt: isString,
  updatedAt: isString,
} satisfies { [Field in keyof WorkItem]-?: (value: unknown) => value is WorkItem[Field] }

function isWorkItem(value: unknown): value is WorkItem {
  return (
    isRecord(value) &&
    Object.entries(workItemFields).every(([field, check]) => check(value[field]))
  )
}

export function parseWorkItemsResponse(value: unknown): WorkItemsResponse {
  if (
    !isRecord(value) ||
    typeof value.requestId !== 'string' ||
    !Array.isArray(value.data) ||
    !value.data.every(isWorkItem)
  ) {
    throw new WorkItemsResponseError('work-items response does not match its contract')
  }
  return { data: value.data, requestId: value.requestId }
}
