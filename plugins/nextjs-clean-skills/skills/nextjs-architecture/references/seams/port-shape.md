# Port Shape

**Impact: HIGH** · **Scope: portable**

A port describes what the caller needs, never the surface of the thing behind it. Once a port earns its place (see [Dependency Categories](dependency-categories.md)), its grain decides whether the code above it has anything to do.

Signs the grain is wrong:

- method names match table operations or backend endpoints one-for-one
- every method maps to exactly one query or one request
- the type is named after a stored entity rather than a capability

That port is shallow by construction, and everything layered on it becomes forwarding.

**Incorrect (mirrors storage):**

```ts
export type CampaignRepository = {
  list; listByColumn; getById; getDates; create; update; remove; reorderInColumn
}
```

**Correct (mirrors a capability):**

```ts
export type CampaignBoard = {
  loadBoard(filters: BoardFilters): Promise<BoardView>
  applyEdit(edit: CampaignEdit): Promise<Campaign>
  changeStatus(id: string, status: CampaignStatus): Promise<Campaign>
}
```

`loadBoard` returns what one workflow needs in one round trip; `applyEdit` can become a single transaction. The returned view is a domain projection, not a bag of props for one screen.

One adapter may implement several narrow role interfaces when it is genuinely one integration. A consumer that only reads depends on the reading role alone, so its dependency list documents exactly what it touches.

A port owns its own types when the external shape diverges from what the application models. Reuse an application type only where a field genuinely is that concept, and never stretch one over a wire format.

When one capability has one consumer, the port may collapse to a function type rather than an object with methods. It is still a port: the consumer receives it instead of importing the implementation.

Reference: role interfaces at the seam; adapters own the external contract.
