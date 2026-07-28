import { readBoardForRsc } from '../../modules/board/rsc.js'
import {
  createBoardServer,
  type BoardServer,
} from '../../modules/board/server.js'
import type { LabelsServer } from '../../modules/labels/server.js'
import type { WorkItemsServer } from '../../modules/work-items/server.js'
import type {
  Reporter,
  ReportingContext,
} from '../../shared/server/reporting.js'

export function composeBoardPage(dependencies: {
  labels: LabelsServer
  workItems: WorkItemsServer
}): BoardServer {
  return createBoardServer(dependencies)
}

export async function renderBoardPage(
  context: ReportingContext & { tenantId: string },
  server: BoardServer,
  reporter: Reporter
) {
  return readBoardForRsc(context, server, reporter)
}
