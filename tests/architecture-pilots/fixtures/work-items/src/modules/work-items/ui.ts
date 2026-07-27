import type { WorkItem } from './domain/work-item.js'
import {
  toCreateInput,
  toInitialFormValues,
  type WorkItemFormValues,
} from './ui/form.js'

export type WorkItemFormModel = {
  initialValues: WorkItemFormValues
  submit(values: WorkItemFormValues): ReturnType<typeof toCreateInput>
}

export function createWorkItemFormModel(item?: WorkItem): WorkItemFormModel {
  return {
    initialValues: toInitialFormValues(item),
    submit: toCreateInput,
  }
}
