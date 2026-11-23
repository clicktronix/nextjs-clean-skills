import { isForbidden } from '../../../shared/kernel/failure.js'
import type { RequestIdentity } from '../../../shared/kernel/request-identity.js'
import { reportUnexpected, type Reporter } from '../../../shared/server/reporting.js'
import { toWorkItemsResponse } from '../../../modules/work-items/contracts.js'
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
  // Identity is established inside the channel's error boundary: a session provider that fails
  // is an unexpected failure of this channel, reported once and answered with a generic 5xx.
  let identity: RequestIdentity | null = null
  try {
    identity = await dependencies.authenticate(request)
    if (!identity) {
      return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })
    }

    const headers = { 'x-request-id': identity.requestId }
    const items = await dependencies.server.list(identity)
    if (isForbidden(items)) {
      return Response.json(
        { error: { code: 'FORBIDDEN' }, requestId: identity.requestId },
        { status: 403, headers }
      )
    }
    return Response.json(toWorkItemsResponse(items, identity.requestId), { headers })
  } catch (error) {
    const requestId = identity?.requestId ?? request.headers.get('x-request-id') ?? 'unidentified'
    reportUnexpected(dependencies.reporter, error, 'work-items.http', identity ?? { requestId })
    return Response.json(
      { error: { code: 'INTERNAL_ERROR' }, requestId },
      { status: 500, headers: { 'x-request-id': requestId } }
    )
  }
}
