# DAL Is Server-Only

**Impact: CRITICAL**

Protected reads should go through a server-only Data Access Layer.

Pattern:

- import `server-only`
- verify session/authz before reading data
- return DTO/domain-shaped data without sensitive fields
- use React `cache()` only for request-deduped auth helpers
- use Cache Components only with explicit user/tenant inputs and scoped tags

DAL modules are consumed by Server Components, route handlers, or Server Actions. They are not Client Component APIs.

**Incorrect (protected read callable from client code):**

```ts
export async function getProfile(userId: string) {
  return db.profile.findUnique({ where: { userId } })
}
```

**Correct (server-only DAL verifies session):**

```ts
import 'server-only'

export async function getCurrentProfile() {
  const user = await verifySession()
  return getProfileDto(user.id)
}
```

Reference: Next.js Data Access Layer and `server-only`.
