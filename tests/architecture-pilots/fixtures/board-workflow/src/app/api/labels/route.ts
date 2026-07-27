import type { LabelsServer } from '../../../modules/labels/server.js'
import { reportUnexpected, type Reporter } from '../../../shared/server/reporting.js'

export type LabelsHttpContext = {
  tenantId: string
  requestId: string
}

export type LabelsHttpDependencies = {
  authenticate(request: Request): Promise<LabelsHttpContext | null>
  labels: LabelsServer
  reporter: Reporter
}

export async function getLabels(
  request: Request,
  dependencies: LabelsHttpDependencies
): Promise<Response> {
  const context = await dependencies.authenticate(request)
  if (!context) {
    return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })
  }

  try {
    const labels = await dependencies.labels.listForBoard(context.tenantId)
    return Response.json(
      { data: labels, requestId: context.requestId },
      { headers: { 'x-request-id': context.requestId } }
    )
  } catch (error) {
    reportUnexpected(dependencies.reporter, error, 'labels.http', context)
    return Response.json(
      { error: { code: 'INTERNAL_ERROR' }, requestId: context.requestId },
      { status: 500, headers: { 'x-request-id': context.requestId } }
    )
  }
}
