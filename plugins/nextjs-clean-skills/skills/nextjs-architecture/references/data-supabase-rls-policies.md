# Supabase RLS Policies

**Impact: HIGH**

Enable RLS for tables with user or tenant data and make every operation explicit.

Policy checklist:

- use `(select auth.uid())` instead of repeated direct `auth.uid()` calls.
- index columns referenced by policies.
- keep service-role access in server-only modules.
- validate returned rows before exposing them.
- pair `for update ... using (...)` with `with check (...)` for the post-update row.
- decide delete behavior explicitly: soft-delete only, admin hard-delete, or self-delete.

`using` decides which rows can be targeted. `with check` decides what the row may look like after insert/update. Missing `with check` on self-editable identity tables can allow role, tenant, or email self-promotion.

**Incorrect (self-update can change authority columns):**

```sql
create policy users_self_update on public.users
  for update to authenticated
  using ((select auth.uid()) = id);
```

**Correct — `security definer` helper for the role lookup, then pin in `with check`:**

```sql
-- private.current_user_role(uuid) is a security definer function that selects
-- role from public.users; place it in a private schema with search_path=''.
create policy users_self_update on public.users
  for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = private.current_user_role((select auth.uid()))
  );
```

Use `security definer` helpers for role or membership lookups that would otherwise query RLS-protected tables from inside policies. Keep those helpers in a private, non-exposed schema and set `search_path = ''`.

Delete policy decision:

1. Soft-delete only: no `delete` policy; app updates `archived_at`/`status`.
2. Admin hard-delete: add an explicit `for delete` policy gated by role.
3. Self-delete: rare; pair with cleanup hooks and a narrow policy.

**Soft-delete intent documented:**

```sql
comment on table public.work_items is
  'Soft-delete via archived_at. Hard delete is service-role only.';
```

**Admin hard-delete via RLS:**

```sql
create policy work_items_admin_delete on public.work_items
  for delete to authenticated
  using (public.get_user_role((select auth.uid())) in ('owner', 'admin'));
```

Document cascade blast radius before granting hard delete.

Reference: PostgreSQL `CREATE POLICY` and Supabase RLS guidance.
