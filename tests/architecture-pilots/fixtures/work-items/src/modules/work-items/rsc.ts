import { reportUnexpected, type Reporter } from '../../shared/server/reporting.js'
import type { RequestContext, WorkItemsServer } from './server.js'

export async function readWorkItemsForRsc(
  context: RequestContext,
  server: WorkItemsServer,
  reporter: Reporter
) {
  try {
    return await server.list(context)
  } catch (error) {
    reportUnexpected(reporter, error, 'work-items.rsc', context)
    throw error
  }
}
