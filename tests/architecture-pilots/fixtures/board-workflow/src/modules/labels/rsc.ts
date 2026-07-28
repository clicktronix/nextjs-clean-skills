import {
  reportUnexpected,
  type Reporter,
  type ReportingContext,
} from '../../shared/server/reporting.js'
import type { LabelsServer } from './server.js'

export async function readLabelsForRsc(
  context: ReportingContext & { tenantId: string },
  server: LabelsServer,
  reporter: Reporter
) {
  try {
    return await server.listForBoard(context.tenantId)
  } catch (error) {
    reportUnexpected(reporter, error, 'labels.rsc', context)
    throw error
  }
}
