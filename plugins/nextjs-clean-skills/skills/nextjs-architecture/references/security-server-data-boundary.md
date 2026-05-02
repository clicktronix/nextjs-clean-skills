# Server Data Boundary

**Impact: CRITICAL**

Protected data must be guarded where it is read or mutated, not only where navigation is routed.

Server data boundary rules:

- DAL/read modules that touch protected data import `server-only`.
- Protected reads verify session/authz before reading data.
- Server Actions authenticate, parse input, authorize after parsing, and derive `userId`, `role`, and `tenantId` from server context.
- `proxy.ts` may refresh sessions, redirect, set headers, or generate CSP metadata, but it is not the authorization boundary.
- Return DTO/domain-shaped data, not raw database rows.

Server Components can leak props through the RSC payload. Treat every value passed to UI as client-visible unless proven otherwise.

**Incorrect (proxy protection plus raw row exposure):**

```ts
export async function getProfile(userId) {
  return db.profile.findUnique({ where: { userId } })
}
```

**Correct (server-only DAL verifies and maps):**

```ts
import 'server-only'

export async function getCurrentProfile() {
  const user = await verifySession()
  return toProfileDto(await getProfileRow(user.id))
}
```

Strip service flags, provider metadata, internal IDs, secrets, and authority fields unless the UI explicitly needs them. Client validation, disabled buttons, hidden inputs, bound args, and route protection are UX helpers only.

Reference: Next.js Data Access Layer, Server Actions security guidance, and `server-only`.
