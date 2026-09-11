# Cache Components

**Impact: HIGH** · **Scope: stack (Next.js 16 Cache Components)**

A `'use cache'` function runs outside the request. Inside it there is no `cookies()`, `headers()`
or request-scoped client, and every argument is part of the key, so every argument must be
serializable. The cache boundary therefore sits below the identity boundary.

| Question | Answer |
| --- | --- |
| where | `server/**`, after identity and client are resolved |
| what crosses in | ids, tenant, filters: serializable values only |
| what never crosses | client, reporter, identity object, request context |
| store access | from the capability's own composition, not an argument |
| per-user data | `'use cache: private'`, or leave it uncached |
| tags and lifetimes | `cacheTag`/`cacheLife` inside the function; names in a private `server/**` module |
| invalidation | the channel that wrote: `updateTag` in `actions.ts`, `revalidateTag(tag, 'max')` in a handler or job |
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

The channel resolves identity first and passes `identity.tenantId`, never `identity`. A result
that differs per user is not a shared cache: mark it `'use cache: private'` or read it uncached
under a Suspense boundary.

`query-cache.ts` carries TanStack Query keys only; Next.js tags stay private to `server/**`.
Application and domain code import nothing from `next/cache`.

Reference: the cache boundary sits below the identity boundary, and the writer invalidates.
