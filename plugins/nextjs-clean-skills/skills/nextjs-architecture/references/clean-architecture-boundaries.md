# Clean Architecture Boundaries

**Impact: CRITICAL**

Choose the layer before writing files. Dependency direction is compile-time, not runtime.

| Layer | Owns | May import |
| --- | --- | --- |
| `domain/**` | Schemas, types, pure rules | nothing project-specific |
| `use-cases/**` | Scenarios, ports, feature types | domain, local ports/types |
| `adapters/outbound/**` | Port implementations | domain, use-case port types |
| `adapters/inbound/next/**` | Server Actions, Route Handlers, webhooks | use-cases, outbound factories, infrastructure |
| server-only DAL/read entrypoints | Authenticated read composition | use-cases, outbound factories, infrastructure |
| `ui/server-state/**` | TanStack query keys/hooks | inbound APIs/actions, client-safe transport |
| `app/**` | routes, layouts, metadata, RSC entrypoints | DAL/read entrypoints, UI, server actions |
| `ui/**` | views and client interaction | UI hooks, server-state, domain types, local actions |
| `infrastructure/**` | auth, env, logging, cache helpers | domain and technical libraries |

Runtime can flow downward from UI to inbound to use-case to outbound. Imports do not mirror every runtime call: use-cases depend on ports, not concrete adapters.

Avoid a generic `src/lib/**` dumping ground. Put helpers in the layer that owns the reason for change: `infrastructure` for env/auth/logging/cache/persistence support, `ui` for browser/UI bridges, `domain` for pure business helpers, and `adapters` for transport or persistence helpers. If a repo keeps legacy `lib`, treat it as a migration bucket, not a place for new architecture.

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
