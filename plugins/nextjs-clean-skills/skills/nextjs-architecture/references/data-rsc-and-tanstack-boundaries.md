# RSC And TanStack Ownership

**Impact: HIGH**

Default reads in Next.js 16 are Server Components plus server-only DAL/read functions. TanStack Query is opt-in when a Client Component genuinely owns async cache lifecycle.

Use this ownership model:

| Need | Default |
| --- | --- |
| Server-rendered dashboard/list/detail | RSC -> DAL -> serializable props |
| Create/update/delete from UI | Server Action -> use-case -> cache tags |
| External HTTP/API command | Route Handler -> use-case -> response envelope |
| Realtime, polling, infinite scroll, optimistic UI | TanStack Query |

Do not use TanStack Query inside Server Components. Await DAL/read functions directly and pass serializable props to Client children.

Add TanStack Query only when at least one is true: realtime/WebSocket merges into client cache, polling/progress updates without navigation, infinite client pagination, optimistic lifecycle tied to a TanStack-owned read, or multiple client islands share async stale/fetch/refetch state.

Avoid these anti-patterns:

- `useQuery` in RSC.
- `useMutation` only to call `invalidateQueries` after an action that already invalidates RSC tags.
- client filters that should be URL state.
- backing the same read with both RSC props and `useQuery`.
- using Server Actions as generic query RPC when RSC reads are enough.

If the read is RSC-owned, call the action directly and optionally use `router.refresh()` for immediate payload refresh. If the read is TanStack-owned, use `useMutation` to update or invalidate the matching query keys.

Reference: Next.js Server Components, React 19 `useTransition`, TanStack Query mutation lifecycle.
