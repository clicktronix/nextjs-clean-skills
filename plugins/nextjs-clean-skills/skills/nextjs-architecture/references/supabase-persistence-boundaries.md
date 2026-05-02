# Supabase Persistence Boundaries

**Impact: HIGH**

Supabase access belongs behind outbound adapters or server-only infrastructure helpers.

Use-case owns the port:

```ts
export type UsersRepository = { update(input: UpdateUser): Promise<User> }
```

Outbound adapter implements it:

```ts
export function createSupabaseUsersRepository(client): UsersRepository {
  return { update: async (input) => mapUserRow(await updateRow(client, input)) }
}
```

Inbound/DAL composes it with the concrete client. UI and use-cases do not import Supabase clients.

RLS guardrails:

- enable RLS for user/tenant data.
- prefer `(select auth.uid())` in policies.
- pair update `using` with `with check` so users cannot self-promote.
- use private `security definer` helpers for role/membership lookups that would recurse through protected tables.

For exact SQL syntax and performance details, fetch current Supabase docs. The architectural rule is stable: Supabase is an outbound implementation detail.

Reference: Supabase as outbound adapter plus RLS as database-side authority.
