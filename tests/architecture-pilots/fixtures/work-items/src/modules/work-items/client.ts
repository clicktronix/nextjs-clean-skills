import { parseWorkItemsResponse, WORK_ITEMS_PATH, type WorkItem } from './contracts.js'

export type WorkItemsFetcher = (path: string) => Promise<Response>

export async function fetchWorkItems(fetcher: WorkItemsFetcher): Promise<WorkItem[]> {
  const response = await fetcher(WORK_ITEMS_PATH)
  if (!response.ok) {
    throw new Error(`work-items request failed with ${response.status}`)
  }

  return parseWorkItemsResponse(await response.json()).data
}
