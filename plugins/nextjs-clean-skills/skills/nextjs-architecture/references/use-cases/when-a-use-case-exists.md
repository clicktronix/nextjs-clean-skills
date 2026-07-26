# When A Use-Case Exists

**Impact: CRITICAL** · **Scope: portable**

The layer is not mandatory. A use-case earns its file when there is application logic to hold; otherwise the inbound adapter calls the data module directly — still through the wrapper, which is what carries validation, failure normalisation, and single-report telemetry on that path too.

The test is the impure sandwich: **effect, then a pure transformation, then effect.** Missing middle means missing use-case.

```text
read (effect)  ->  decide/derive in domain (pure)  ->  write or return (effect)
```

Create a use-case when at least one holds:

- **orchestration** — two or more seams participate
- **a rule the store does not own** — an invariant that cannot or should not live in SQL
- **a projection** — combining sources into a shape no single source returns
- **a shared contract** — one validated entry point serving several inbound shapes

A single effect through a **port** is the same case: the inbound adapter declares the boundary, supplies the adapter for that port, and calls it. A port decides how the dependency is reached, never whether a scenario exists.

Do not create one when the body would be a single call passed straight through. That module fails the deletion test: removing it concentrates nothing, because it holds nothing.

**Incorrect (no middle — this is the data module wearing a hat):**

```ts
export async function listCampaigns(deps: Deps) {
  return deps.campaigns.list()
}
```

**Correct (effect, pure decision, effect):**

```ts
export const moveCampaign = defineBoundary({
  name: 'moveCampaign',
  input: MoveCampaignSchema,
  output: CampaignListSchema,
  async run(ctx, { id, targetColumnId, targetIndex }) {
    const column = await campaignsData.listByColumn(ctx, targetColumnId)
    const ordered = reorderInto(column, id, targetIndex)
    return campaignsData.saveOrder(ctx, targetColumnId, ordered)
  },
})
```

`reorderInto` is a pure domain function, so the interesting part is testable without a database.

Name a use-case for the intention behind it — what the user or system is trying to do. When the name reads as a storage operation, ask which intention it serves; if there is none, there is no use-case.

Never re-implement in the application a transaction the store already performs. Calling it is correct; mirroring it creates a second source of truth that drifts.

Reference: use-case as an impure context around a pure transformation.
