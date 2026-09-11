import { forbidden, type Forbidden } from '../../../shared/kernel/failure.js'
import type { RequestIdentity } from '../../../shared/kernel/request-identity.js'
import type { CreateWorkItemInput, WorkItem } from '../domain/work-item.js'
import type { WorkItemsServerDependencies } from './contracts.js'

function canManageWorkItems(identity: RequestIdentity): boolean {
  return identity.roles.includes('admin')
}

export async function listAuthorizedWorkItems(
  identity: RequestIdentity,
  dependencies: WorkItemsServerDependencies
): Promise<WorkItem[] | Forbidden> {
  if (!canManageWorkItems(identity)) return forbidden()
  return dependencies.store.list(identity.tenantId)
}

export async function createAuthorizedWorkItem(
  identity: RequestIdentity,
  input: CreateWorkItemInput,
  dependencies: WorkItemsServerDependencies
): Promise<WorkItem | Forbidden> {
  if (!canManageWorkItems(identity)) return forbidden()
  return dependencies.store.create(identity.tenantId, input)
}
