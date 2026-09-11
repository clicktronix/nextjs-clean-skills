import type { WorkItemsServer, WorkItemsServerDependencies } from './contracts.js'
import { createAuthorizedWorkItem, listAuthorizedWorkItems } from './service.js'
import { createHttpWorkItemSource, createWorkItemStore, type WorkItemsFetcher } from './store.js'

export type WorkItemsRuntimeOptions = {
  baseUrl: string
  fetcher?: WorkItemsFetcher
}

export function createWorkItemsServer(dependencies: WorkItemsServerDependencies): WorkItemsServer {
  return {
    list: (identity) => listAuthorizedWorkItems(identity, dependencies),
    create: (identity, input) => createAuthorizedWorkItem(identity, input, dependencies),
  }
}

export function createWorkItemsRuntime({ baseUrl, fetcher }: WorkItemsRuntimeOptions): WorkItemsServer {
  return createWorkItemsServer({
    store: createWorkItemStore(createHttpWorkItemSource({ baseUrl, fetcher })),
  })
}

// A runtime memo, not a service locator: the application's root composition configures the
// capability once from its environment, and the channel roots of this capability (actions.ts,
// rsc.ts) read it. Callers never pass the server in from the browser.
let configured: WorkItemsServer | null = null

export function configureWorkItemsRuntime(options: WorkItemsRuntimeOptions): WorkItemsServer {
  configured = createWorkItemsRuntime(options)
  return configured
}

export function workItemsServer(): WorkItemsServer {
  if (!configured) throw new Error('work-items runtime is not configured')
  return configured
}
