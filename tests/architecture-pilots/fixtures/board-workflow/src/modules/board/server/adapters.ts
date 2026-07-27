import type { BoardReaders } from '../application/ports.js'
import type { LabelsServer } from '../../labels/server.js'
import type { WorkItemsServer } from '../../work-items/server.js'

export function createBoardReaders(dependencies: {
  labels: LabelsServer
  workItems: WorkItemsServer
}): BoardReaders {
  return {
    labels: {
      list: (tenantId) => dependencies.labels.listForBoard(tenantId),
    },
    workItems: {
      list: (tenantId) => dependencies.workItems.listForBoard(tenantId),
    },
  }
}
