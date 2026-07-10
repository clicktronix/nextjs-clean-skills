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
- use private `security definer` helpers only for role/membership lookups that would recurse through protected tables.

For exact SQL syntax and performance details, fetch current Supabase docs. The architectural rule is stable: Supabase is an outbound implementation detail.

## Bulk Writes Via Scoped RPC

Replace `Promise.all(N x update())` with one scoped write boundary when the use-case needs atomic ordering or batch semantics. The port accepts actor/tenant scope plus updates; the adapter may use an RPC, but scope preservation is the rule.

```sql
CREATE FUNCTION public.reorder_in_column(actor_id uuid, updates jsonb) RETURNS SETOF campaigns
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.campaigns c SET column_id = u.column_id, position = u.position
  FROM jsonb_to_recordset(updates) AS u(id uuid, column_id uuid, position int)
  WHERE c.id = u.id AND c.created_by = actor_id
  RETURNING c.*;
$$;
```

Use tenant or parent scope instead of `actor_id` when that is the domain authority. Never publish an unscoped bulk update example. Parse returned rows through the domain schema before returning DTO/domain values.

## Error Mapping

Never rethrow a Postgres/PostgREST message. Map known codes to transport-neutral application errors such as `ConflictError`; log raw payloads server-side. Inbound adapters map them to HTTP, Server Action, or other public results. Use-cases never depend on `ApiError`, `Response`, or framework errors.

## Explicit Column Selection

Avoid `select('*')` on hot read paths. Maintain a per-entity column constant and select explicitly so migrations do not leak new fields or waste bandwidth.

Reference: Supabase as outbound adapter plus RLS as database-side authority.
