# RLS `with check` Locks Identity Columns

**Impact: HIGH**

When a table is editable by its owner (`for update ... using ((select auth.uid()) = id)`), the `with check` clause must additionally pin every authority column — typically `role`, `email`, `created_at`, tenant assignment, audit columns. Without that pin, the user can flip their own role or impersonate another email in a single update.

`using` decides who can target a row. `with check` decides what the row may look like AFTER the update. They are independent gates; missing one is missing security.

Apply this whenever a self-mutable table contains any column the application treats as identity, role, or invariant audit data.

**Incorrect (user can promote themselves to owner):**

```sql
create policy users_self_update on public.users
  for update
  to authenticated
  using ((select auth.uid()) = id);
```

**Correct (`role` and `email` pinned):**

```sql
create policy users_self_update on public.users
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = (select u.role from public.users as u where u.id = (select auth.uid()))
    and email = (select u.email from public.users as u where u.id = (select auth.uid()))
  );
```

Notes:

- For columns that should change (`updated_at`, `full_name`), do NOT include them in `with check`.
- Pair with a separate admin policy for fields admins may edit; do not relax self-update to fix admin needs.
- Test by attempting `update users set role = 'owner'` from a normal user. It should be rejected by the `with check` policy; do not silently allow or bypass it.

Reference: PostgreSQL CREATE POLICY (`USING` vs `WITH CHECK`); Supabase RLS guidance.
