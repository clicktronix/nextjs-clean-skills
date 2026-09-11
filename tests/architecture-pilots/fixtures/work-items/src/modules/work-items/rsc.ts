import type { Forbidden } from '../../shared/kernel/failure.js'
import type { RequestIdentity } from '../../shared/kernel/request-identity.js'
import { reportUnexpected, type Reporter } from '../../shared/server/reporting.js'
import type { WorkItem, WorkItemsServer } from './server.js'

export async function readWorkItemsForRsc(
  identity: RequestIdentity,
  server: WorkItemsServer,
  reporter: Reporter
): Promise<WorkItem[] | Forbidden> {
  try {
    return await server.list(identity)
  } catch (error) {
    reportUnexpected(reporter, error, 'work-items.rsc', identity)
    throw error
  }
}
