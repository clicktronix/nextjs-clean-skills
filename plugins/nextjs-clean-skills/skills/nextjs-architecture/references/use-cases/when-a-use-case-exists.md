# When A Use-Case Exists

**Impact: CRITICAL** · **Scope: portable**

The layer is not mandatory. A use-case earns its file when there is application logic to hold; otherwise the inbound adapter calls the data module directly — still through a boundary declaration, which carries validation, normalisation and single-report telemetry there too.

The gate is the **deletion test**: delete the module, and if nothing concentrates elsewhere, it held nothing. The impure sandwich — **effect, pure transformation, effect** — is a useful heuristic for spotting that, not a definition; a missing middle is a signal to look closer, not a verdict.

Create a use-case when at least one holds:

- **orchestration** — two or more seams participate
- **a rule the store does not own** — an invariant that cannot or should not live in SQL
- **a projection** — combining sources into a shape no single source returns
- **a shared contract** — one declared entry point serving several inbound shapes

The last one does not license an empty forward: two callers of a pass-through do not create application logic. What is shared then is the *declaration*, which belongs at the boundary the callers already reach, not in a use-case function that adds a hop.

A single effect through a **port** is not by itself a use-case: the declaration supplies the adapter and calls it. A port decides how a dependency is reached; the deletion test decides whether a scenario exists.

A slice that has one exposes two surfaces:

```text
use-cases/<slice>/entries/**      declarations — validate, normalise, report once
use-cases/<slice>/operations/**   typed functions — throw typed failures, report nothing
```

Inbound adapters reach `entries/**`; composition reaches `operations/**`, so reporting stays at the outermost declaration.

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
  execute: moveCampaignOperation,
})
```

The operation it wraps reorders with a pure domain function, so the interesting part tests without a database.

Name a use-case for the intention behind it; when the name reads as a storage operation, ask which intention it serves.

Never mirror a transaction the store already performs: that is a second source of truth.

Reference: the deletion test decides; the impure sandwich is a heuristic for applying it.
