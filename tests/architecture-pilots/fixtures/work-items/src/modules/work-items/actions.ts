'use server'

import { isForbidden } from '../../shared/kernel/failure.js'
import { reportUnexpected } from '../../shared/server/reporting.js'
import { currentRequestScope } from '../../shared/server/request-scope.js'
import {
  parseCreateWorkItemInput,
  WorkItemInputError,
  type WorkItem,
} from './domain/work-item.js'
import { workItemsListTag } from './server/cache-tags.js'
import { workItemsServer } from './server/composition.js'

export type CreateWorkItemActionState =
  | { ok: true; item: WorkItem }
  | { ok: false; code: 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' }

// Everything in the arguments came from the browser. Identity, the reporter and the cache
// primitive are resolved from the request the framework is serving, never accepted as parameters.
export async function createWorkItemAction(
  _previous: CreateWorkItemActionState | null,
  formData: FormData
): Promise<CreateWorkItemActionState> {
  const scope = await currentRequestScope()
  if (!scope.identity) return { ok: false, code: 'UNAUTHENTICATED' }

  try {
    const input = parseCreateWorkItemInput(fieldsOf(formData))
    const created = await workItemsServer().create(scope.identity, input)
    if (isForbidden(created)) return { ok: false, code: 'FORBIDDEN' }
    // Read-your-writes for the request that wrote: the action channel invalidates the tag it owns.
    await scope.invalidate(workItemsListTag(scope.identity.tenantId))
    return { ok: true, item: created }
  } catch (error) {
    if (error instanceof WorkItemInputError) return { ok: false, code: 'INVALID_INPUT' }
    reportUnexpected(scope.reporter, error, 'work-items.action', scope.identity)
    throw error
  }
}

function fieldsOf(formData: FormData): Record<string, unknown> {
  return {
    title: formData.get('title'),
    description: formData.get('description') || null,
    priority: formData.get('priority') === 'on',
    dueAt: formData.get('dueAt') || null,
  }
}
