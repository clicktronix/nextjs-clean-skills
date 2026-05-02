# RSC Reads Default, TanStack Opt-In

**Impact: HIGH**

The default read path in Next.js 16 is RSC + DAL + serializable props. TanStack Query is auxiliary; introduce it only when a Client Component genuinely owns the cache lifecycle.

Default read path:

- Server Component awaits a DAL/read use-case
- result is passed as serializable props to Client children
- mutations call Server Actions that invalidate the relevant tag via `revalidateTag` / `updateTag`

Add TanStack Query only when at least one is true:

- a realtime/WebSocket subscription must merge into a client cache
- the page polls or streams progress updates that re-render without navigation
- the UI needs `useMutation` lifecycle (`onMutate`/`onSettled`/optimistic) AND a TanStack-owned read
- the list grows via infinite scroll/cursor pagination on the client
- multiple unrelated client islands must observe the same async/server-state cache lifecycle: shared data, stale/fetching status, refetch, dedupe, or cache updates

Do not introduce TanStack Query for:

- a dashboard whose data is fetched once per navigation — use RSC props
- a form whose only client need is to disable inputs while submitting — use `useTransition` + a plain action call
- "client filters" that should be reflected in the URL — use `useSearchParams`/`router.replace`
- invalidation after a Server Action that already calls `revalidateTag` or `updateTag` for an RSC-owned read — see [Avoid TanStack Mutations When Reads Are RSC-Owned](./data-tanstack-mutation-vs-revalidate-tag.md)
- deduplication of server reads — `React.cache()` already handles per-request dedup inside the DAL

Do not create `ui/server-state` just because data came from a server. Do not back the same read with both RSC props and a `useQuery` — pick one ownership model per read path.

Reference: Next.js 16 RSC reads, React 19 `useTransition`, TanStack Query opt-in patterns.
