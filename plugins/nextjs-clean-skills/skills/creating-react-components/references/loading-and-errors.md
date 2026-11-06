# Loading And Errors

**Scope: stack (Next.js App Router)**

Routes own framework files; capabilities own the UI they describe.

| Surface | Owns |
| --- | --- |
| `loading.tsx` | fallback for a segment's page and children |
| inline `<Suspense>` | one independently resolving page region |
| `error.tsx` | segment render failure and retry |
| `global-error.tsx` | root-document failure as a last resort |
| `not-found.tsx` | deliberate `notFound()` UI |

A root `loading.tsx` is coarse; nest boundaries where parts resolve independently.

Use inline `<Suspense>` for the smallest independent slow region. Layouts and pages render in
parallel. Within one component, sequential awaits create a waterfall; start independent requests
before awaiting them.

An RSC failure has one capture owner, settled in
[Runtime Boundaries](../../../docs/runtime-boundaries.md#failures-and-reporting). Suspense scopes pending UI, not errors. To preserve surrounding content after a region fails, use a
nested or parallel route with `error.tsx`, or wrap one component with `catchError(fallback)` from
`next/error`.

`error.tsx` receives `{ error, reset, retry }` as props; a `catchError` fallback receives them second,
`fallback(props, { error, reset, retry })`. Prefer `retry()`, which refetches the boundary's Server
Component data; `reset()` does not. Before Next.js 16.3 the names were
`unstable_retry` and `unstable_catchError`.

Expected outcomes do not become generic exceptions. Render empty, denied, validation, and conflict
states, or map them to deliberate framework control flow. Do not swallow `redirect` or `notFound()`
in a generic catch ([RSC Reads](../../../docs/runtime-boundaries.md#rsc-reads)).

A skeleton preserves final geometry. Use a spinner when shape is unknown and no placeholder for
immediate content.

Localize these surfaces and preserve accessible structure; `global-error.tsx` cannot assume root
providers survive. Loading completion alone does not move focus. Follow
[Styling, Text, And Accessibility](./styling-and-i18n.md) for status announcements and focus.

Verification: render pending, empty, populated, expected failure, and unexpected failure, and
confirm the layout stays stable across them.

Reference: [loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading),
[fetching data](https://nextjs.org/docs/app/getting-started/fetching-data),
[error handling](https://nextjs.org/docs/app/getting-started/error-handling),
[parallel routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes).
