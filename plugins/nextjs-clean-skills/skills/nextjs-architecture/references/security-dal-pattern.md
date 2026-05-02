# Data Access Layer With `server-only` And React `cache()`

**Impact: CRITICAL**

The DAL is the only place that reads protected data. Wrap every read in `import 'server-only'`, deduplicate it per request with React `cache()`, and verify the session before exposing data. This is the official Next.js authentication pattern.

DAL function shape:

1. `import 'server-only'` at the top — fails the build if the module ever ends up in a Client bundle.
2. `verifySession = cache(async () => { ... })` — memoizes session decode per request so RSC, layout, page, and metadata all share one verify call.
3. Inside the cached function: read the session cookie, decode/validate, redirect if missing, return a minimal session DTO.
4. Each read entrypoint calls `verifySession()` before touching the database, then maps the row to a domain DTO before returning.

**Incorrect (raw row exposure, no dedup, no `server-only`):**

```ts
export async function getProfile(userId: string) {
  return db.profile.findUnique({ where: { userId } })
}
```

**Correct (DAL composition):**

```ts
import 'server-only'
import { cache } from 'react'

export const verifySession = cache(async () => {
  const session = await decodeSession((await cookies()).get('session')?.value)
  if (!session?.userId) redirect('/login')
  return { userId: session.userId, role: session.role }
})
```

```ts
export async function getCurrentProfile() {
  const { userId } = await verifySession()
  return toProfileDto(await getProfileRow(userId))
}
```

Notes:

- `React.cache()` is the canonical dedup primitive for non-`fetch` data inside an RSC render. `fetch` GETs dedup automatically; database/Supabase calls do not.
- DAL DTOs strip secrets, service flags, internal IDs, provider metadata, and authority columns the UI must not see.
- Route Handlers are not part of the React component tree, so `cache()` does not memoize across them — derive context per request inside the handler.
- Auth/authz reverification belongs here, not in `proxy.ts`. See [Server Data Boundary](./security-server-data-boundary.md).

Reference: Next.js Data Access Layer authentication guide; React 19 `cache()` API.
