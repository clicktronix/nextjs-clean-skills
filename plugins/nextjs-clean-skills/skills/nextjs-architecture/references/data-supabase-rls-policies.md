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

**Correct (authority columns pinned):**

```sql
create policy users_self_update on public.users
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id and role = 'user');
```

If hard delete is intentionally denied, document soft-delete in the migration. If hard delete is allowed, add a `for delete` policy and document cascade blast radius.

Reference: PostgreSQL `CREATE POLICY` and Supabase RLS guidance.
