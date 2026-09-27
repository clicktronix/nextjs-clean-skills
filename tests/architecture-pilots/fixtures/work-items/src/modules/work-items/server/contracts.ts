import type { Forbidden } from '../../../shared/kernel/failure.js'
import type { RequestIdentity } from '../../../shared/kernel/request-identity.js'
import type { CreateWorkItemInput, WorkItem } from '../domain/work-item.js'

// The capability's own role vocabulary. It never enters RequestIdentity and is never lent.
export type WorkItemsRole = 'manager' | 'viewer'

export type WorkItemsServerDependencies = {
  access: {
    rolesOf(identity: RequestIdentity): Promise<readonly WorkItemsRole[]>
  }
  store: {
    list(tenantId: string): Promise<WorkItem[]>
    create(tenantId: string, input: CreateWorkItemInput): Promise<WorkItem>
  }
}

export type WorkItemsServer = {
  list(identity: RequestIdentity): Promise<WorkItem[] | Forbidden>
  create(identity: RequestIdentity, input: CreateWorkItemInput): Promise<WorkItem | Forbidden>
}
