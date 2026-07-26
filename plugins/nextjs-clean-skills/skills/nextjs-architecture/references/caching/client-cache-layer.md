# Client Cache Layer

**Impact: HIGH** · **Scope: stack (Next.js + TanStack)**

One instance of [Cache Tiers And Read Ownership](cache-tiers.md), for projects using TanStack Query. It answers what
the ownership rule leaves open: where this code lives, and which runtime executes it.

Home is `src/client-cache/<slice>/` — a top-level layer, not a folder under `ui/`. One folder per
capability, four files:

```text
keys.ts        cache keys — pure, both runtimes
queries.ts     read hooks — browser
mutations.ts   write hooks + invalidation — browser
prefetch.ts    seeding — server, called from a Server Component
```

`prefetch.ts` is not an anomaly here: a page builds a cache instance, fills it, serialises it, and
ships it to the browser. Preparing a client cache on the server is exactly what dehydrate and
hydrate do.

Name the layer after the tier, not its contents: its job is to hold a keyed copy with a lifecycle,
and every rule here follows from that.

May import: inbound adapters, domain types, its own keys, shared timing constants, and browser-side
transports it owns — auth events, realtime subscriptions, stream clients. Must not import outbound
data adapters, database clients, presentation components, or `app/`.

A read hook whose fetcher reaches a data module or an adapter has skipped the entry point and
its authorization.

Owner defaults: read-heavy pages belong to the server render; realtime, polling, infinite scroll,
and optimistic lifecycle belong here; writes go through a Server Action and then invalidate
whichever owner the affected read has.

Do not call these hooks in Server Components. Do not wrap a Server Action in a mutation hook only
to invalidate a key when the affected read is server-owned.

Tag APIs are framework syntax; fetch current Next.js docs. Policy: `updateTag` in Server Actions
for read-your-own-writes, `revalidateTag(tag, 'max')` for stale-while-revalidate or Route Handler
invalidation. Server-owned reads invalidate tags; cache-owned reads invalidate keys.

Rare hybrid (reference data needs synchronous first paint **and** client-side optimistic CRUD):
seed the island from the server read as `initialData` — not `useState` — with an explicit
freshness decision (`initialDataUpdatedAt`, or `0` to refetch immediately). Not for pure client
lists or static pages.

Keep cache access out of presentation components: reaching the cache directly bypasses the slice's
keys and its invalidation contract.

Reference: TanStack Query as the client cache tier in an App Router application.
