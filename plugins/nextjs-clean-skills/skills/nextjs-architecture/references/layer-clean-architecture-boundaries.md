# Clean Architecture Boundaries

**Impact: CRITICAL**

Choose the layer before writing code. Runtime calls may go outward, but compile-time imports must protect dependency inversion.

Layer roles:

- `domain/**`: schemas, inferred types, invariants, and pure helpers only.
- `use-cases/**`: application orchestration through local ports; no concrete adapters.
- `adapters/outbound/**`: implementations of use-case ports for Supabase, APIs, queues, or transport.
- `adapters/inbound/next/**`: composition root for Server Actions and Route Handlers.
- `app/**` and `ui/**`: framework entrypoints, presentation, local UI state, and server-state hooks.

Use-cases must not import outbound adapters, inbound adapters, Next.js APIs, React hooks, TanStack Query, Supabase clients, cookies, headers, or clocks. Inbound adapters may import use-cases, outbound factories, and infrastructure because they compose runtime dependencies.

**Incorrect (use-case constructs infrastructure):**

```ts
import { createSupabaseWorkItemsRepository } from '@/adapters/outbound/supabase/work-items.repository'

export async function archiveWorkItem(ctx, id) {
  return createSupabaseWorkItemsRepository(ctx.supabase).archive(id)
}
```

**Correct (inbound composes; use-case receives a port):**

```ts
export async function archiveWorkItem(deps, id) {
  return deps.workItems.archive(id)
}
```

Build feature slices in dependency order: domain -> use-case ports/functions -> outbound implementation -> inbound action/route/DAL -> UI -> tests. Substitute libraries freely, but keep the roles: Valibot can change, Supabase can change, TanStack can be absent, and the boundary still holds.

Reference: Clean Architecture dependency rule.
