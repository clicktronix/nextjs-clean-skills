import { reportUnexpected, type Reporter } from '../../shared/server/reporting.js'
import type { LabelsServer } from './server.js'

export async function readLabelsForRsc(
  tenantId: string,
  server: LabelsServer,
  reporter: Reporter
) {
  try {
    return await server.listForBoard(tenantId)
  } catch (error) {
    reportUnexpected(reporter, error, 'labels.rsc')
    throw error
  }
}
