import type { WorkItem } from './domain/work-item.js'

export type WorkItemsFetcher = (path: string) => Promise<Response>

export async function fetchWorkItems(fetcher: WorkItemsFetcher): Promise<WorkItem[]> {
  const response = await fetcher('/api/work-items')
  if (!response.ok) {
    throw new Error(`work-items request failed with ${response.status}`)
  }

  const payload = (await response.json()) as { data: WorkItem[] }
  return payload.data
}
