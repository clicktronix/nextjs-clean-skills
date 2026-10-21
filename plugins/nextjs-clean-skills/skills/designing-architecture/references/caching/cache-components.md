# Cache Components

**Scope: stack (Next.js 16 Cache Components)**

A shared `'use cache'` function runs outside the request. Inside it there is no `cookies()`,
`headers()` or request-scoped client, and every argument is part of the key, so every argument must
be serializable. The cache boundary therefore sits below the identity boundary.

| Question | Answer |
| --- | --- |
| where | `server/**`, after identity and client are resolved |
| what crosses in | ids, tenant, filters: serializable values only |
| what never crosses | client, reporter, identity object, request context |
| store access | the capability's own composition, not an argument; no cookies, so no user session |
| tenant-private read | privileged store bypasses RLS: authorize first, filter by the tenant argument |
| public read | anonymous store, still under RLS as `anon` |
| per-user data | `'use cache: private'` or uncached (contract rule 3) |
| tags and lifetimes | `cacheTag`/`cacheLife` inside the function; names in a private `server/**` module |
| invalidation | [Architecture Contract § Cache Components](../../../../docs/architecture-contract.md#cache-components), rule 5 |
| current-request read from `rsc.ts` | under `loading.tsx` or an inline `<Suspense>`; the build fails otherwise |

```ts
// server/read-model.ts
export async function listForTenant(tenantId: string, filter: Filter) {
  'use cache'
  cacheTag(workItemsListTag(tenantId))
  cacheLife('minutes')
  return workItemsStore().list(tenantId, filter)
}
```

The channel resolves identity first and passes `identity.tenantId`, never `identity`. A privileged
store inside the cache carries the obligations of [Supabase RLS](../outbound/supabase-rls.md): the
channel authorized the actor, and the query filters by the scope it was given. An anonymous store
never serves a tenant-private read.

A result that differs per user is not a shared cache. For `'use cache: private'` or an uncached read
under a Suspense boundary, follow rule 3 of the contract section above.

`query-cache.ts` carries TanStack Query keys only; Next.js tags stay private to `server/**`.
Application and domain code import nothing from `next/cache`.
