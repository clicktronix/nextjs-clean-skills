// The tag vocabulary is private to server/**: the channel root that performed a write asks for the
// tag by scope and calls the framework's invalidation primitive itself. Nothing outside this
// capability learns how its cache is keyed.
export const workItemsListTag = (tenantId: string): string => `work-items:list:${tenantId}`
