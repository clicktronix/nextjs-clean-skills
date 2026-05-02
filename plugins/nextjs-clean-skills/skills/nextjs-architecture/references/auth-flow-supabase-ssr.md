# Auth Flow With Supabase SSR

**Impact: CRITICAL**

Supabase SSR auth has three integration points that must agree, or users get silently logged out.

1. **`proxy.ts` — session refresh boundary.** Call `supabase.auth.getUser()` immediately after `createServerClient()` for every request that needs auth state. `getUser()` validates the JWT server-side AND triggers token refresh; `getClaims()` only validates locally and never refreshes. Supabase docs are explicit: "DO NOT REMOVE auth.getUser()".
2. **DAL (`verifySession`) — authority for reads.** Server Components never trust the proxy; they call `verifySession()` again. It runs `getUser()` through React `cache()` to dedup per request.
3. **AuthContext — client read state.** Bootstraps from SSR `getCurrentUserAction()`, then keeps fresh via TanStack `useSession` + Supabase `onAuthStateChange`. Never holds the access token in memory; reads it from cookies.

Server actions:

- `signInAction` uses the **plain** action client (no `authActionClient`) — the user is not authenticated yet.
- `signUpAction` same — plain client.
- `signOutAction` plain client (no-op if already unauthenticated is acceptable).
- `getCurrentUserAction` calls `verifySession()` and returns a DTO mapped from `auth.users` + `public.users`.

**Incorrect (skipping `getUser()` in proxy):**

```ts
const { data } = await supabase.auth.getSession() // does NOT refresh tokens
```

**Correct (proxy refreshes via `getUser()`):**

```ts
const { data: { user } } = await supabase.auth.getUser()
const isAuthenticated = !!user
```

Notes:

- OAuth provider input must be a `picklist(['google', 'github', ...])`, never a free string — open redirect risk through `redirectTo`.
- Do not bind `userId` or `role` as Server Action arguments; derive them from `ctx` after `getUser()` ([Do Not Bind Secrets To Actions](./actions-bind-no-secrets.md)).
- First-user-becomes-owner bootstrap belongs in a `security definer` Postgres trigger guarded by `pg_advisory_xact_lock` to avoid race conditions.

Reference: Supabase SSR auth guide; Next.js DAL authentication pattern.
