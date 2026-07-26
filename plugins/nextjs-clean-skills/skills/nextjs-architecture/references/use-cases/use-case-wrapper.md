# The Use-Case Wrapper

**Impact: CRITICAL** · **Scope: portable**

Cross-cutting concerns belong to one wrapper at the application seam. Without it every inbound shape grows its own arrangement and they drift apart.

The wrapper is not the use-case. A slice with no scenario still needs the guarantees: its inbound adapter declares the boundary with the same combinator, wrapping the data call. What is optional is the scenario, never the contract.

The combinator is written once, in `boundary/` — its own layer beside `ports/`, not part of infrastructure — and every application entry is declared through it, scenario or not.

```ts
// A slice with no scenario: the boundary wraps the data call directly.
export const listWorkItems = defineBoundary({
  name: 'listWorkItems',
  input: WorkItemListParamsSchema,
  output: WorkItemPageSchema,
  redact: ['token'],
  run: (ctx, params) => workItemsData.list(ctx, params),
})
```

What the caller is guaranteed, every time:

1. input validated — including `undefined`, `''`, `0`, `false`; a falsy input is not a reason to skip validation
2. output validated, so the contract does not depend on what an adapter happened to return
3. nothing thrown escapes; failures arrive as a result value
4. one log and one telemetry event per failure, tagged with `name`
5. declared fields removed before anything reaches logs or telemetry

A one-line body is fine once the wrapper is real: the leverage is in the guarantees. Compare the unwrapped forward in [When A Use-Case Exists](when-a-use-case-exists.md).

Composition is ordinary code: independent work runs together, a pure function shapes the result, and the outer declaration owns the contract.

```ts
export const getBoardData = defineBoundary({
  name: 'getBoardData',
  input: BoardFiltersSchema,
  output: BoardViewSchema,
  run: async (ctx, filters) =>
    toBoardView(
      await Promise.all([listWorkItems.run(ctx, filters), listLabels.run(ctx)]),
    ),
})
```

`defineBoundary` exposes the raw body as `.run`. Call a nested use-case through it, so the value arrives unwrapped and its failures normalise exactly once, at the outermost boundary. Calling the wrapped export instead returns a result object, which the outer `output` schema rejects.

Domain functions are called directly: pure and in-process, nothing to inject or normalise.

Do not re-wrap. An entry point that re-logs what the boundary already reported produces duplicate telemetry and makes failure counts meaningless.

Reference: one application boundary owns validation, failure normalisation, and reporting.
