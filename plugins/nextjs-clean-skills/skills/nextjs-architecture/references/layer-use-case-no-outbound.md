# Use-Cases Do Not Import Outbound

**Impact: CRITICAL**

Use-cases orchestrate application scenarios through explicit dependencies.

Rule:

- define ports in `src/use-cases/<feature>/ports.ts`
- accept a `deps` object satisfying those ports
- call domain validation and pure helpers
- return domain or DTO-shaped results

Never import:

- outbound adapters or Supabase clients
- inbound Server Actions or route handlers
- Next.js cache/request APIs
- React hooks or TanStack Query

Inbound adapters may call use-cases. Use-cases must not know which adapter implements a port.

**Incorrect (use-case constructs infrastructure):**

```ts
import { createSupabaseWorkItemsRepository } from '@/adapters/outbound/supabase/work-items.repository'

export async function archiveWorkItem(ctx, id: string) {
  const repo = createSupabaseWorkItemsRepository(ctx.supabase)
  return repo.archive(id)
}
```

**Correct (use-case receives a port):**

```ts
export async function archiveWorkItem(deps: { workItems: WorkItemsRepository }, id: string) {
  return deps.workItems.archive(id)
}
```

Reference: Clean Architecture dependency inversion.
