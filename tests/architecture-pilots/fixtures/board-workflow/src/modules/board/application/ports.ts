import type { LabelsServer } from '../../labels/server.js'
import type { WorkItemsServer } from '../../work-items/server.js'

// The orchestrator names what it needs from each sibling as a type taken from that sibling's
// public server surface. The compiler erases the edge; the public surface is the ownership
// boundary. A port in board's own vocabulary and a private mapping adapter appear only when the
// deletion test names policy in the mapping — here the summaries are already the board's words.
export type BoardReaders = {
  workItems: Pick<WorkItemsServer, 'listForBoard'>
  labels: Pick<LabelsServer, 'listForBoard'>
}
