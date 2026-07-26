# The Boundary Declaration

**Impact: CRITICAL** · **Scope: portable**

Cross-cutting concerns belong to one declaration at the application seam; otherwise every inbound shape grows its own arrangement and they drift.

The declaration is not the use-case: a slice with no scenario declares the boundary around its data call. What is optional is the scenario, never the contract.

The combinator is written once, in `boundary/` — its own layer beside `ports/` — and every application entry is declared through it.

What the caller is guaranteed, every time:

1. input validated — including `undefined`, `''`, `0`, `false`; falsy is no reason to skip
2. output validated, so the contract does not depend on what an adapter happened to return
3. no thrown value escapes; failures arrive as a result value
4. one log and one telemetry event per failure, tagged with `name`
5. declared fields removed before anything reaches logs or telemetry

One exception to (3): **framework control flow**. Navigation and not-found signals are implemented by throwing, so the combinator must re-throw them instead of normalising them — otherwise a redirect silently becomes an application failure.

A one-line body is fine once the declaration is real: the leverage is in the guarantees.

**Composition never reaches through a declaration.** Name the body as an internal operation and let both use it — the declaration owns the public contract, the operation is trusted and reusable:

```ts
async function loadBoardOperation(ctx: Context, filters: BoardFilters) {
  const [items, labels] = await Promise.all([listItems(ctx, filters), listLabels(ctx)])
  return toBoardView(items, labels)
}
```

The declaration owns only the contract:

```ts
export const loadBoard = defineBoundary({
  name: 'loadBoard',
  input: BoardFiltersSchema,
  output: BoardViewSchema,
  execute: loadBoardOperation,
})
```

A declaration that exposes its raw body — a public `.run` — is an escape hatch around its own guarantees: the outer output schema rejects the inner result object, so callers normalise twice or not at all. A body two slices share is a named internal function, not a field on someone's contract.

Do not re-wrap. An entry point that re-logs what the boundary already reported produces duplicate telemetry and makes failure counts meaningless.

Reference: one application boundary owns validation, normalisation, and reporting.
