# When A Use-Case Exists

**Impact: CRITICAL** · **Scope: portable**

The layer is not mandatory. A use-case earns its file when there is application logic to hold; otherwise the inbound adapter calls the data module directly — still through a boundary declaration, which carries the same guarantees there.

The gate is the **deletion test**: delete the module, and if nothing concentrates elsewhere, it held nothing. The impure sandwich — **effect, pure transformation, effect** — helps spot that, but is not a definition; a missing middle is a signal to look closer, not a verdict.

Create a use-case when at least one holds:

- **orchestration** — two or more seams participate
- **a rule the store does not own** — an invariant that cannot or should not live in SQL
- **a projection** — combining sources into a shape no single source returns
- **a shared contract** — one declared entry serving several inbound shapes

The last does not license an empty forward: two callers of a pass-through create no application logic. What is shared is the *declaration*, and it belongs at the boundary the callers already reach.

A single effect through a **port** is not by itself a use-case: the declaration supplies the adapter and calls it. A port decides how a dependency is reached; the deletion test, whether a scenario exists.

Both examples below are operations, so the pair compares.

**Incorrect (holds nothing — the data module wearing a hat):**

```ts
export async function listCampaigns(deps: Deps) {
  return deps.campaigns.list()
}
```

**Correct (effect, pure decision, effect):**

```ts
export async function moveCampaignOperation(input: MoveCampaign, deps: Deps) {
  const current = await deps.campaigns.list(input.boardId)
  const moved = moveWithinBoard(current, input.id, input.position)
  await deps.campaigns.saveOrder(moved)
  return moved
}
```

`moveWithinBoard` is pure, so the decision tests without a database. The entry that declares this operation is a separate module in a separate layer — see [The Boundary Declaration](./use-case-wrapper.md).

Name a use-case for its intention; when the name reads as a storage operation, ask which intention it serves.

Never mirror a transaction the store already performs: that is a second source of truth.

Reference: the deletion test decides; the impure sandwich is a heuristic for applying it.
