import { loadBoard, type Board } from './application/load-board.js'
import type { LabelsServer } from '../labels/server.js'
import type { WorkItemsServer } from '../work-items/server.js'
import { createBoardReaders } from './server/adapters.js'

export type BoardServer = {
  load(tenantId: string): Promise<Board>
}

export function createBoardServer(dependencies: {
  labels: LabelsServer
  workItems: WorkItemsServer
}): BoardServer {
  const readers = createBoardReaders(dependencies)
  return {
    load: (tenantId) => loadBoard(tenantId, readers),
  }
}
