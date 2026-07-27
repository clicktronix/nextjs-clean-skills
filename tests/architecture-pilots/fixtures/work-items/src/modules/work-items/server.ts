import type { CreateWorkItemInput, WorkItem } from './domain/work-item.js'
import {
  createAuthorizedWorkItem,
  listAuthorizedWorkItems,
} from './server/service.js'

export type { CreateWorkItemInput, WorkItem } from './domain/work-item.js'

export type RequestContext = {
  actorId: string
  tenantId: string
  requestId: string
  roles: string[]
}

export type WorkItemsServerDependencies = {
  store: {
    list(tenantId: string): Promise<WorkItem[]>
    create(tenantId: string, input: CreateWorkItemInput): Promise<WorkItem>
  }
  cache: {
    invalidate(tenantId: string): Promise<void>
  }
}

export type WorkItemsServer = {
  list(context: RequestContext): Promise<WorkItem[]>
  create(context: RequestContext, input: CreateWorkItemInput): Promise<WorkItem>
}

export function createWorkItemsServer(
  dependencies: WorkItemsServerDependencies
): WorkItemsServer {
  return {
    list: (context) => listAuthorizedWorkItems(context, dependencies),
    create: (context, input) => createAuthorizedWorkItem(context, input, dependencies),
  }
}
