# Loading And Errors

**Impact: HIGH** · **Scope: stack (Next.js App Router)**

Routes own framework files; capabilities own the UI they describe.

| Surface | Owns |
| --- | --- |
| `loading.tsx` | fallback for a segment's page and children |
| inline `<Suspense>` | one independently resolving page region |
| `error.tsx` | segment render failure and retry |
| `global-error.tsx` | root-document failure as a last resort |
| `not-found.tsx` | deliberate `notFound()` UI |

`loading.tsx` streams a Suspense fallback for the segment's page and children. A root boundary is
coarse; nest boundaries where parts resolve independently.

Use inline `<Suspense>` for the smallest independent slow region. Layouts and pages render in
parallel. Within one component, sequential awaits create a waterfall; start independent requests
before awaiting them.

Choose one RSC capture owner: framework instrumentation or the Client boundary. Do not report from
both. See
[failure ownership](../../nextjs-architecture/references/errors/failure-at-the-boundary.md).
Suspense scopes pending UI, not errors. To preserve surrounding content after a region fails, use a
nested or parallel route with `error.tsx`, or the project's component Error Boundary.

Use the callback from the installed `ErrorInfo` type. `reset()` clears the boundary and rerenders
its children, which suits a temporary render failure. Next.js 16.2 adds `unstable_retry()`, which
also refreshes the route; prefer it when recovery must refetch RSC data.

Expected outcomes do not become generic exceptions. Render empty, denied, validation, and conflict
states, or map them to deliberate framework control flow. Do not swallow `redirect` or `notFound()`
in a generic catch.

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
