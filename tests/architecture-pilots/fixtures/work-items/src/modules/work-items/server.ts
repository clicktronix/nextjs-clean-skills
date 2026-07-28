import type { CreateWorkItemInput, WorkItem } from './domain/work-item.js'
import type {
  WorkItemsServer,
  WorkItemsServerDependencies,
} from './server/contracts.js'
import {
  createAuthorizedWorkItem,
  listAuthorizedWorkItems,
} from './server/service.js'
import {
  createHttpWorkItemSource,
  createWorkItemStore,
  type WorkItemsFetcher,
} from './server/store.js'

export type { CreateWorkItemInput, WorkItem } from './domain/work-item.js'
export type {
  RequestContext,
  WorkItemsServer,
  WorkItemsServerDependencies,
} from './server/contracts.js'

export type WorkItemsRuntimeOptions = {
  baseUrl: string
  cache: WorkItemsServerDependencies['cache']
  fetcher?: WorkItemsFetcher
}

export function createWorkItemsServer(
  dependencies: WorkItemsServerDependencies
): WorkItemsServer {
  return {
    list: (context) => listAuthorizedWorkItems(context, dependencies),
    create: (context, input) => createAuthorizedWorkItem(context, input, dependencies),
  }
}

export function createWorkItemsRuntime({
  baseUrl,
  cache,
  fetcher,
}: WorkItemsRuntimeOptions): WorkItemsServer {
  return createWorkItemsServer({
    store: createWorkItemStore(createHttpWorkItemSource({ baseUrl, fetcher })),
    cache,
  })
}
