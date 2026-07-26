# Security, DAL, And Auth

**Impact: CRITICAL** · **Scope: stack (Next.js + Supabase)**

`proxy.ts` is not the authorization boundary. It may refresh sessions, redirect, set headers, or seed locale/CSP metadata. Data access still verifies auth/authz where data is read or mutated.

Security boundary rules:

- protected reads go through server-only read entrypoints: verify the session, declare the boundary, return domain-shaped data — never raw rows.
- Server Actions authorize using server-derived context.
- Route Handlers build a request context and authorize before calling use-cases.
- never trust hidden fields, bound args, or client validation for authority.
- service-role clients and secrets live in server-only infrastructure/outbound modules.
- Supabase SSR: never trust `getSession()` for server auth; follow current docs for `getClaims()` vs `getUser()` before changing proxy/session refresh code.
- post-login redirects accept only same-origin paths from a shared helper. Reject `//`, `\`/`%5C`, control chars, and auth-loop targets.

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

For exact Supabase SSR or `server-only` syntax, fetch current docs. The rule is stable: auth is rechecked at the data boundary.

## Input Parsing And Length Caps

Every payload is parsed through a declared schema — TypeScript argument types are not a runtime barrier. Which boundary runs it is settled in [Validate Once Per Trust Boundary](../use-cases/validation-once.md); this rule is about the caps it carries.

Cap every user-supplied array and free-form string at the schema level; downstream proxy limits must not be relied on. Suggested ceilings: customer reads ~100; admin reads ~1000; bulk writes ~500; free-form text 4k–8k chars.

## Defense-In-Depth Ownership Filter

RLS is the database-side authority. Whichever module issues the write still adds an explicit ownership predicate on user-scoped writes, so a regressed policy or a service-role client cannot silently escalate.

```ts
await client.from('campaigns')
  .update(patch).eq('id', id).eq('created_by', userId)
```

For child rows, scope by the parent the caller controls (`.eq('campaign_id', scope.campaignId)`).

Reference: Next.js DAL authentication pattern; Supabase SSR auth guidance.
