'use server'

import {
  parseCreateWorkItemInput,
  WorkItemInputError,
  type WorkItem,
} from './domain/work-item.js'
import { reportUnexpected, type Reporter } from '../../shared/server/reporting.js'
import type { RequestContext, WorkItemsServer } from './server.js'

export type CreateWorkItemActionState =
  | { ok: true; item: WorkItem }
  | { ok: false; code: 'INVALID_INPUT' }

export async function createWorkItemAction(
  rawInput: unknown,
  context: RequestContext,
  server: WorkItemsServer,
  reporter: Reporter
): Promise<CreateWorkItemActionState> {
  try {
    const input = parseCreateWorkItemInput(rawInput)
    return { ok: true, item: await server.create(context, input) }
  } catch (error) {
    if (error instanceof WorkItemInputError) {
      return { ok: false, code: 'INVALID_INPUT' }
    }
    reportUnexpected(reporter, error, 'work-items.action', context)
    throw error
  }
}
