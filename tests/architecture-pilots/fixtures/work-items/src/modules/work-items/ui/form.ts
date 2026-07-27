import type { CreateWorkItemInput, WorkItem } from '../domain/work-item.js'

export type WorkItemFormValues = {
  title: string
  description: string
  priority: boolean
}

export function toInitialFormValues(item?: WorkItem): WorkItemFormValues {
  return {
    title: item?.title ?? '',
    description: item?.description ?? '',
    priority: item?.priority ?? false,
  }
}

export function toCreateInput(values: WorkItemFormValues): CreateWorkItemInput {
  return {
    title: values.title,
    description: values.description.length > 0 ? values.description : null,
    priority: values.priority,
  }
}
