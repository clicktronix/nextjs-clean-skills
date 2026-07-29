# Loading And Errors

**Impact: HIGH** · **Scope: stack (Next.js App Router)**

Pending and failure states are owned surfaces. Routes own framework files; capabilities own the UI
they describe.

| Surface | Owns |
| --- | --- |
| `loading.tsx` | fallback for a segment's page and children |
| inline `<Suspense>` | one independently resolving page region |
| `error.tsx` | segment render failure and retry |
| `global-error.tsx` | root-document failure as a last resort |
| `not-found.tsx` | deliberate `notFound()` UI |

`loading.tsx` wraps the segment's page and children in Suspense and streams its fallback. A root
boundary is coarse: without nesting, covered content reveals as one unit. Nest boundaries where
parts resolve independently.

Use inline `<Suspense>` for the smallest region that can render alone and is genuinely slower than
its siblings. Layouts and pages render in parallel by default. Within one component, sequential
awaits create a waterfall; start independent requests before awaiting them.

Error boundaries are Client Components that catch render failures below them. Choose one RSC
capture owner: framework instrumentation or the boundary. Do not report from both. See
[failure ownership](../../nextjs-architecture/references/errors/failure-at-the-boundary.md).

Expected outcomes do not become generic exceptions. Render empty, denied, validation, and conflict
states, or map them to deliberate framework control flow. Do not swallow `redirect` or `notFound()`
in a generic catch.

A skeleton preserves the final layout's main geometry. Use a spinner when shape is unknown, and no
placeholder for content that resolves immediately.

Localize these surfaces and preserve accessible structure; `global-error.tsx` cannot assume root
providers survive. Loading completion alone does not move focus. Follow
[Styling, Text, And Accessibility](./styling-and-i18n.md) for status announcements and focus.

Verification: render pending, empty, populated, expected failure, and unexpected failure, and
confirm the layout stays stable across them.

Reference: [loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading),
[fetching data](https://nextjs.org/docs/app/getting-started/fetching-data),
[error handling](https://nextjs.org/docs/app/getting-started/error-handling).
