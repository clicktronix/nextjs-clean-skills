# Cache Tiers And Read Ownership

**Impact: HIGH** · **Scope: portable**

A cache is a tier, not a data source. It sits above the entry point it calls and holds a copy of
what that call returned. Nothing behind the seam knows it exists.

That placement has a consequence worth stating: a client-side cache is **not** an adapter. It does
not talk to an external system — it calls the application's own entry point, so it belongs on the
driving side, above inbound, below the views that consume it.

## One owner per read path

Every read has exactly one owner, decided before the code is written.

| Need | Owner |
| --- | --- |
| read-heavy page content | the server render, passing plain values down |
| realtime, polling, infinite scroll, optimistic updates | the client cache |
| shareable filters, tabs, paging | the URL |
| a value several components derive | neither — compute it |

Two owners for one read is the failure this rule exists to prevent. The symptoms are familiar: a
value that updates in one place and not another, a refetch that fights a fresh render, or a write
that invalidates one copy while the other keeps serving the old one.

## Invalidation belongs to the owner

Whoever owns a read owns its invalidation. A write invalidates the owner of every read it
affects — not the tier that happened to be convenient at the call site.

On a page where different sections have different owners, record which owner controls which
subset. That note is what lets the next writer invalidate correctly.

## Adding a tier is not free

A shared server-side cache in front of the store — a `shared-server-cache` owner — is a third tier, and the ownership question gains
a third answer. Two of three tiers invalidated is worse than one of two, because the stale tier
still looks authoritative and nothing signals which copy is older.

Before adding one, name what it caches, who invalidates it, and what a stale entry costs. If those
three answers are not ready, the tier is premature.

## Seeding, not copying

A client cache may be seeded from a value the server already produced, so the first paint is not
blank. Seeding is a handoff with an explicit freshness decision. Copying server data into ordinary
component state is not — it produces a second, unowned copy that nothing invalidates.

Reference: cache tiers as a layer above the entry point, with one owner per read.
