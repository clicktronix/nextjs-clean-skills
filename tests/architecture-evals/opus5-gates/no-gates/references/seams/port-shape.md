# Port Shape

**Impact: HIGH** · **Scope: portable**

A port describes what its owning application operation needs, not the API behind it.

Wrong-grain signals:

- methods mirror table operations or provider endpoints;
- each method maps one-to-one to a query;
- names use SDK or storage vocabulary;
- the port exists only for a test mock.

```ts
type CampaignRepository = {
  list(): Promise<Row[]>
  update(id: string, patch: Patch): Promise<Row>
}
type CampaignBoard = {
  loadBoard(filters: BoardFilters): Promise<BoardView>
  applyEdit(edit: CampaignEdit): Promise<Campaign>
}
```

The first mirrors storage. The second is a capability conversation.

Keep role interfaces narrow. One adapter may implement several roles, but each consumer receives
only the role it uses. A one-method function type is valid when one operation needs one capability.

Ports own application-facing types. External wire and provider types remain in the private adapter.

Reference: role interfaces and purposeful conversations at a capability seam.
