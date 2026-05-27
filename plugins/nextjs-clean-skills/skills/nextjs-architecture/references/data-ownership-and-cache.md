# Data Ownership And Cache

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

## RSC + Client Hybrid Read (rare)

Only when reference data needs synchronous first paint **and** client-side optimistic CRUD: the RSC-owned read seeds the client island as `initialData` with an explicit freshness decision, and mutations invalidate whichever owner controls the read. Use the server timestamp as `initialDataUpdatedAt` when known; `0` means "render now, refetch immediately". If multiple islands consume the read, use a hydration strategy instead of hand-passing `initialData`.

Do not use this for pure search/filter lists (client lifecycle only) or static pages without writes (RSC props only).

Reference: Next.js RSC/cache ownership; client query async lifecycle. Fetch current docs for syntax.
