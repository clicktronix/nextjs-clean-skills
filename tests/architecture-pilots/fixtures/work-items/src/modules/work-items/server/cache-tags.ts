// The tag vocabulary is private to server/**. The channel that performed a write hands over its
// framework primitive — updateTag in an action, revalidateTag with the operation's profile in a
// handler — and this owner supplies the tags, so nothing outside the capability learns how its
// cache is keyed.
export const workItemsListTag = (tenantId: string): string => `work-items:list:${tenantId}`

export async function expireWorkItems(
  tenantId: string,
  expire: (tag: string) => void | Promise<void>
): Promise<void> {
  await expire(workItemsListTag(tenantId))
}
