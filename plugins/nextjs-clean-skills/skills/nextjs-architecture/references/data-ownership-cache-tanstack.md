# Data Ownership, Cache, And TanStack

**Impact: HIGH**

Pick one owner for each read path.

| Need | Default owner |
| --- | --- |
| Read-heavy dashboard/list/detail | RSC + server-only DAL + serializable props |
| UI create/update/delete | Server Action -> use-case -> cache invalidation |
| External service/API command | Route Handler -> use-case -> JSON response |
| Realtime, polling, infinite scroll, optimistic client lifecycle | TanStack Query |
| URL-shareable filters/tabs/paging | URL search params, not a client store |

Do not back the same read with both RSC props and `useQuery`. Do not use TanStack Query in Server Components. Do not wrap a Server Action in `useMutation` only to invalidate a TanStack key when the affected read is RSC-owned.

Cache Components and tag APIs are framework syntax. The architecture decision is simpler:

- RSC-owned reads invalidate server cache tags.
- TanStack-owned reads invalidate/update TanStack keys.
- mixed pages must document which subset each owner controls.

For exact cache API syntax, fetch current Next.js docs. Policy: `updateTag` in Server Actions for read-your-own-writes; `revalidateTag(tag, 'max')` for stale-while-revalidate or Route Handler invalidation.

## RSC DAL Hybrid Read

For reference data that needs synchronous first paint **and** client-side optimistic CRUD, combine RSC DAL fetch with TanStack `initialData`:

1. Server DAL fetches with `'use cache'` + `cacheTag(...)` and returns serializable rows.
2. RSC passes rows as `initialData` props to a Client island.
3. Client `useQuery` receives `initialData` plus an explicit freshness decision.
4. Mutations call a Server Action and invalidate the matching tag with `updateTag` or `revalidateTag`.

```ts
useQuery({
  queryKey: keys.list(),
  queryFn: getListAction,
  initialData,
  initialDataUpdatedAt: initialData ? serverFetchedAt : undefined,
})
```

Use `initialDataUpdatedAt: serverFetchedAt` when known. Use `0` only for "render now, refetch immediately". If one query feeds multiple islands or TanStack owns freshness, prefer `prefetchQuery` + `HydrationBoundary`.

Do not apply this hybrid to interactive search/filter lists (pure TanStack) or to mostly-static pages without writes (pure RSC props).

Reference: Next.js RSC/cache ownership; TanStack Query client async lifecycle.
