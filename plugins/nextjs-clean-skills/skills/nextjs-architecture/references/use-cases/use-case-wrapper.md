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

Because of (3), **the declaration knows nothing about the framework and must not**: it lives in a layer that may import domain only. Framework navigation is implemented by throwing, so it belongs *outside* — the declaration returns `not_found` or a value, and the entry point turns that into navigation. A boundary that recognised framework signals would have to import the framework, which is the dependency this layer exists to keep out.

Two surfaces per slice, and the split is what makes composition work:

```text
entries/**      the declaration: validates, normalises, reports once
operations/**   a typed function: throws typed failures, reports nothing
```

A one-line body is fine once the declaration is real: the leverage is in the guarantees.

```ts
export const loadBoard = defineBoundary({
  name: 'loadBoard',
  input: BoardFiltersSchema,
  output: BoardViewSchema,
  execute: loadBoardOperation,
})
```

`loadBoardOperation` composes other operations — including another slice's, which is the only surface a slice exposes across its own edge. Declarations never call declarations: the inner one would normalise and report the failure under its own name, and its result object would then fail the outer output schema. That is the defect a public `.run` accessor had, and it is why there is no such accessor.

Do not re-wrap. An entry point that re-logs what the boundary already reported produces duplicate telemetry and makes failure counts meaningless.

Reference: one application boundary owns validation, normalisation, and reporting; operations stay typed and silent.
