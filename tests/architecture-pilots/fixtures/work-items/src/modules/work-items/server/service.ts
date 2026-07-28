import type { CreateWorkItemInput, WorkItem } from '../domain/work-item.js'
import type {
  RequestContext,
  WorkItemsServerDependencies,
} from './contracts.js'

function assertCanManageWorkItems(context: RequestContext): void {
  if (!context.roles.includes('admin')) {
    throw new Error('work-items access denied')
  }
}

export async function listAuthorizedWorkItems(
  context: RequestContext,
  dependencies: WorkItemsServerDependencies
): Promise<WorkItem[]> {
  assertCanManageWorkItems(context)
  return dependencies.store.list(context.tenantId)
}

export async function createAuthorizedWorkItem(
  context: RequestContext,
  input: CreateWorkItemInput,
  dependencies: WorkItemsServerDependencies
): Promise<WorkItem> {
  assertCanManageWorkItems(context)
  const item = await dependencies.store.create(context.tenantId, input)
  await dependencies.cache.invalidate(context.tenantId)
  return item
}
