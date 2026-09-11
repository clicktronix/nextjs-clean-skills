import { isForbidden } from '../../../shared/kernel/failure.js'
import type { RequestIdentity } from '../../../shared/kernel/request-identity.js'
import { reportUnexpected, type Reporter } from '../../../shared/server/reporting.js'
import type { WorkItemsServer } from '../../../modules/work-items/server.js'

export type WorkItemsHttpDependencies = {
  authenticate(request: Request): Promise<RequestIdentity | null>
  server: WorkItemsServer
  reporter: Reporter
}

export async function getWorkItems(
  request: Request,
  dependencies: WorkItemsHttpDependencies
): Promise<Response> {
  const identity = await dependencies.authenticate(request)
  if (!identity) {
    return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })
  }

  const headers = { 'x-request-id': identity.requestId }
  try {
    const items = await dependencies.server.list(identity)
    if (isForbidden(items)) {
      return Response.json(
        { error: { code: 'FORBIDDEN' }, requestId: identity.requestId },
        { status: 403, headers }
      )
    }
    return Response.json({ data: items, requestId: identity.requestId }, { headers })
  } catch (error) {
    reportUnexpected(dependencies.reporter, error, 'work-items.http', identity)
    return Response.json(
      { error: { code: 'INTERNAL_ERROR' }, requestId: identity.requestId },
      { status: 500, headers }
    )
  }
}
