# Inbound Is Composition Root

**Impact: CRITICAL**

Inbound adapters are the bridge between Next.js and application code.

They may:
- read request input, cookies, headers, params, and form data
- verify auth/session context
- instantiate outbound repositories
- call use-cases
- trigger `updateTag`, `revalidateTag`, `revalidatePath`, redirects, or response mapping

They must not:
- contain business decisions that belong in domain or use-cases
- return raw database rows
- skip server-side validation because the client already validated input

**Incorrect (use-case imports concrete outbound implementation):**
```ts
// src/use-cases/users/users.ts
import { createSupabaseUserRepository } from '@/adapters/outbound/supabase/users.repository'

export async function updateCurrentUser(ctx, input) {
  return createSupabaseUserRepository(ctx.supabase).update(ctx.userId, input)
}
```

**Correct (inbound composes, use-case depends on a port):**
```ts
// src/use-cases/users/users.ts
export async function updateCurrentUser(deps, userId, input) {
  return deps.users.update(userId, input)
}
```

```ts
// src/adapters/inbound/next/server-actions/users.ts
export const updateCurrentUserAction = withAuthContext(async (ctx, input) => {
  return updateCurrentUser({ users: createSupabaseUserRepository(ctx.supabase) }, ctx.userId, input)
})
```

This is why `adapters/inbound/next/** -> use-cases/**` is correct.

Reference: Clean Architecture dependency rule.
