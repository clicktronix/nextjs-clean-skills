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

## Browser-Owned Reads

For browser-owned reads, TanStack Query calls a GET Route Handler or an explicit stream endpoint.
It does not call a Server Action: Server Functions are mutation-oriented, processed as actions, and
are not recommended for data fetching. RSC-owned reads call server-only code directly instead of
making an HTTP request to the app itself.

Cache Components and tag APIs are framework syntax. The architecture decision is simpler:

- RSC-owned reads invalidate server cache tags.
- TanStack-owned reads invalidate/update TanStack keys.
- mixed pages must document which subset each owner controls.

For exact cache API syntax, fetch current Next.js docs. Policy: `updateTag` in Server Actions for read-your-own-writes; `revalidateTag(tag, 'max')` for stale-while-revalidate or Route Handler invalidation.

Rare RSC+client hybrid (reference data needs synchronous first paint **and** client-side optimistic CRUD): seed the client island from the RSC read as `initialData` — not `useState` — make an explicit freshness decision (`initialDataUpdatedAt`, or `0` to refetch immediately), and have mutations invalidate the read's owner. Not for pure client lists or static pages.

Reference: Next.js RSC/cache ownership; client query async lifecycle. Fetch current docs for syntax.
