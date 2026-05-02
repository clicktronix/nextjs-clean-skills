# Security, DAL, And Auth

**Impact: CRITICAL**

`proxy.ts` is not the authorization boundary. It may refresh sessions, redirect, set headers, or seed locale/CSP metadata. Data access still verifies auth/authz where data is read or mutated.

Security boundary rules:

- protected reads go through server-only DAL/read entrypoints.
- DAL verifies the current session and returns DTO/domain-shaped data, not raw rows.
- Server Actions parse input, then authorize using server-derived context.
- Route Handlers build a request context and authorize before calling use-cases.
- never trust hidden fields, bound args, disabled buttons, or client validation for authority.
- service-role clients and secrets live in server-only infrastructure/outbound modules.
- Supabase SSR: never trust `getSession()` for server auth; follow current docs for `getClaims()` vs `getUser()` before changing proxy/session refresh code.

**Incorrect (route protection plus raw row exposure):**

```ts
export async function getProfile(userId) {
  return db.profile.findUnique({ where: { userId } })
}
```

**Correct (DAL verifies and maps):**

```ts
import 'server-only'
export async function getCurrentProfile() {
  const session = await verifySession()
  return toProfileDto(await getProfileRow(session.userId))
}
```

For exact Supabase SSR token refresh or Next.js `server-only` syntax, fetch current docs. The architectural rule is stable: auth is rechecked at the data boundary.

Reference: Next.js DAL authentication pattern; Supabase SSR auth guidance.
