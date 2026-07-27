import { reportUnexpected, type Reporter } from '../../shared/server/reporting.js'
import type { BoardServer } from './server.js'

export async function readBoardForRsc(
  tenantId: string,
  server: BoardServer,
  reporter: Reporter
) {
  try {
    return await server.load(tenantId)
  } catch (error) {
    reportUnexpected(reporter, error, 'board.rsc')
    throw error
  }
}
