# Cache Tiers And Read Ownership

**Impact: HIGH** · **Scope: stack (Next.js App Router)**

Every read path has one owner:

| Lifecycle | Owner |
| --- | --- |
| initial server render | RSC |
| realtime, polling, infinite, optimistic, or shared browser cache | capability `client/` |
| public HTTP caching | Route Handler and HTTP contract |
| shared server result | capability `server/` |
| shareable filters and paging | URL |
| derived value | no cache; compute it |

A cache stores a copy; it is not a source of truth. Two owners for one read create stale copies and
ambiguous invalidation.

The owner defines:

- key and authorization scope;
- freshness and stale behavior;
- invalidation after writes;
- what a stale value costs.

Application operations may return affected ownership metadata. Runtime surfaces call current
framework invalidation APIs. Portable policy does not import Next.js cache functions.

A browser cache may be seeded from an RSC value with an explicit freshness decision. Copying the
same value into ordinary component state is not seeding.

Before adding a shared server cache, name its key, tenant/user scope, invalidator, and stale-data
cost. Missing answers mean the tier is premature.

Reference: one authoritative owner per read lifecycle.
