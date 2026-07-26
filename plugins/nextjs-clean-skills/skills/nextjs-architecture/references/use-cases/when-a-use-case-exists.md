# When A Use-Case Exists

**Impact: CRITICAL** · **Scope: portable**

The layer is not mandatory. A use-case earns its file when there is application logic to hold; otherwise the inbound adapter calls the data module directly — still through the boundary declaration, which is what carries validation, failure normalisation, and single-report telemetry on that path too.

The gate is the **deletion test**: delete the module, and if nothing concentrates elsewhere, it held nothing. The impure sandwich — **effect, pure transformation, effect** — is a useful heuristic for spotting that, not a definition; a missing middle is a signal to look closer, not a verdict.

Create a use-case when at least one holds:

- **orchestration** — two or more seams participate
- **a rule the store does not own** — an invariant that cannot or should not live in SQL
- **a projection** — combining sources into a shape no single source returns
- **a shared contract** — one declared entry point serving several inbound shapes

The last one does not license an empty forward: two callers of a pass-through do not create application logic. What is shared then is the *declaration*, which belongs at the boundary the callers already reach, not in a use-case function that adds a hop.

A single effect through a **port** is a use-case: the inbound adapter declares the boundary, supplies the adapter for that port, and calls it. A port decides how a dependency is reached, never whether a scenario exists.

**Incorrect (holds nothing — the data module wearing a hat):**

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
  execute: async (ctx, { id, targetColumnId, targetIndex }) => {
    const column = await campaignsData.listByColumn(ctx, targetColumnId)
    const ordered = reorderInto(column, id, targetIndex)
    return campaignsData.saveOrder(ctx, targetColumnId, ordered)
  },
})
```

`reorderInto` is pure, so the interesting part is testable without a database.

Name a use-case for the intention behind it. When the name reads as a storage operation, ask which intention it serves; if there is none, there is no use-case.

Never mirror a transaction the store already performs: that is a second source of truth.

Reference: the deletion test decides; the impure sandwich is a heuristic for applying it.
