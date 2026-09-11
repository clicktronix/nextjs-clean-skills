import { loadBoard, type Board } from './application/load-board.js'
import type { BoardReaders } from './application/ports.js'

export type BoardServer = {
  load(tenantId: string): Promise<Board>
}

export function createBoardServer(dependencies: BoardReaders): BoardServer {
  return {
    load: (tenantId) => loadBoard(tenantId, dependencies),
  }
}
