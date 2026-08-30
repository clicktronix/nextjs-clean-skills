# Capability Client Cache

**Impact: HIGH** · **Scope: stack (Next.js + TanStack Query)**

Use TanStack Query only when the browser owns async lifecycle: realtime, polling, infinite loading,
optimistic updates, or a cache shared by several client islands.

Place that behavior under:

```text
src/modules/<capability>/client/
src/modules/<capability>/client.ts
```

Typical private files are keys, queries, mutations, subscriptions, and optional prefetch helpers.
They are not mandatory.

Browser reads call a `GET` Route Handler with an explicit HTTP cache policy, or a stream, through
`client.ts`. They do not call Server Actions, private stores, provider adapters, or server surfaces.

Mutations call exact functions from top-level `'use server'` `actions.ts` when the command belongs
to this UI. Invalidate only browser-owned reads. Server-owned reads use server cache invalidation.

For one query, seed an island from RSC data as cache `initialData`, not `useState`. Pass the server
fetch timestamp as `initialDataUpdatedAt`, or use `0` to refetch immediately. `staleTime` alone is
not the freshness record: without `initialDataUpdatedAt`, hydration time is treated as data-update
time. For several prefetched queries or nested consumers, use `dehydrate()` and
`HydrationBoundary`; do not describe that strategy as `initialData`.

Keep cache access out of presentation components. Views consume the capability client contract or
receive values as props.

Reference: TanStack Query as one capability's browser lifecycle, not a global architectural layer.
