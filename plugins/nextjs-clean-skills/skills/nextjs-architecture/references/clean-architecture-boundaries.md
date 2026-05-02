# Clean Architecture Boundaries

**Impact: CRITICAL**

Choose the layer before writing files. Dependency direction is compile-time, not runtime.

| Layer | Owns | May import |
| --- | --- | --- |
| `domain/**` | Schemas, types, pure rules | nothing project-specific |
| `use-cases/**` | Scenarios, ports, feature types | domain, local ports/types |
| `adapters/outbound/**` | Port implementations | domain, use-case port types |
| `adapters/inbound/next/**` | Server Actions, Route Handlers, webhooks | use-cases, outbound factories, infrastructure |
| `ui/server-state/**` | TanStack query keys/hooks | inbound APIs/actions, client-safe transport |
| `app/**`, `ui/**` | routes, layouts, views | UI hooks, server-state, domain types, local actions |
| `infrastructure/**` | auth, env, logging, cache helpers | domain and technical libraries |

Runtime can flow downward from UI to inbound to use-case to outbound. Imports do not mirror every runtime call: use-cases depend on ports, not concrete adapters.

**Incorrect (use-case imports concrete persistence):**

```ts
import { createSupabaseUsersRepository } from '@/adapters/outbound/supabase/users'
export async function updateUser(input) { return createSupabaseUsersRepository().update(input) }
```

**Correct (composition root injects the port):**

```ts
export async function updateUser(deps: { users: UsersRepository }, input: UpdateUser) {
  return deps.users.update(input)
}
```

Enforce this with ESLint boundaries. If the target repo has stricter rules, follow the repo.

Reference: Hybrid Clean Architecture dependency rule.
