import { reportUnexpected, type Reporter } from '../../../shared/server/reporting.js'
import type {
  RequestContext,
  WorkItemsServer,
} from '../../../modules/work-items/server.js'

export type WorkItemsHttpDependencies = {
  authenticate(request: Request): Promise<RequestContext | null>
  server: WorkItemsServer
  reporter: Reporter
}

export async function getWorkItems(
  request: Request,
  dependencies: WorkItemsHttpDependencies
): Promise<Response> {
  const context = await dependencies.authenticate(request)
  if (!context) {
    return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })
  }

  try {
    const items = await dependencies.server.list(context)
    return Response.json(
      { data: items, requestId: context.requestId },
      { headers: { 'x-request-id': context.requestId } }
    )
  } catch (error) {
    reportUnexpected(dependencies.reporter, error, 'work-items.http', context)
    return Response.json(
      { error: { code: 'INTERNAL_ERROR' }, requestId: context.requestId },
      { status: 500, headers: { 'x-request-id': context.requestId } }
    )
  }
}
