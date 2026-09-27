import { forbidden, type Forbidden } from '../../../shared/kernel/failure.js'
import type { RequestIdentity } from '../../../shared/kernel/request-identity.js'
import type { CreateWorkItemInput, WorkItem } from '../domain/work-item.js'
import type { WorkItemsRole, WorkItemsServerDependencies } from './contracts.js'

function canManageWorkItems(roles: readonly WorkItemsRole[]): boolean {
  return roles.includes('manager')
}

export async function listAuthorizedWorkItems(
  identity: RequestIdentity,
  dependencies: WorkItemsServerDependencies
): Promise<WorkItem[] | Forbidden> {
  if (!canManageWorkItems(await dependencies.access.rolesOf(identity))) return forbidden()
  return dependencies.store.list(identity.tenantId)
}

export async function createAuthorizedWorkItem(
  identity: RequestIdentity,
  input: CreateWorkItemInput,
  dependencies: WorkItemsServerDependencies
): Promise<WorkItem | Forbidden> {
  if (!canManageWorkItems(await dependencies.access.rolesOf(identity))) return forbidden()
  return dependencies.store.create(identity.tenantId, input)
}
