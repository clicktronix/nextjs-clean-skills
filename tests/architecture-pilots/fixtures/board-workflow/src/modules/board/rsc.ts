import {
  reportUnexpected,
  type Reporter,
  type ReportingContext,
} from '../../shared/server/reporting.js'
import type { BoardServer } from './server.js'

export async function readBoardForRsc(
  context: ReportingContext & { tenantId: string },
  server: BoardServer,
  reporter: Reporter
) {
  try {
    return await server.load(context.tenantId)
  } catch (error) {
    reportUnexpected(reporter, error, 'board.rsc', context)
    throw error
  }
}
