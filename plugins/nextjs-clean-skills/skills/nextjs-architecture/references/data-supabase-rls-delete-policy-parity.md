# Decide The DELETE RLS Policy Explicitly

**Impact: MEDIUM**

When a table has explicit policies for `select`, `insert`, and `update`, the `delete` operation is silently denied to every role unless a matching policy exists. That is sometimes the right answer (force soft-delete via `archived_at`), but it must be a deliberate decision — not an accident.

Audit every RLS-enabled table for one of these three states:

1. **Soft-delete only** — no `delete` policy. Application uses `update set archived_at = now()`. Document this explicitly so admin tooling knows it cannot hard-delete via RLS.
2. **Admin/owner hard-delete** — explicit `delete` policy gated by role. Required when the product needs GDPR erasure or admin cleanup without falling back to the service role.
3. **Self-delete** — explicit `delete` policy with `(select auth.uid()) = id` (or tenant equivalent). Rare; usually paired with a server action that runs cleanup hooks.

Apply this rule whenever introducing a new RLS-enabled table or auditing existing ones. Default to (1) unless there is a concrete admin/erasure requirement.

**Incorrect (admin tools cannot delete; team falls back to service role and bypasses RLS auditing):**

```sql
-- work_items has SELECT/INSERT/UPDATE policies for owner+admin
-- but DELETE is implicitly denied; admin tooling silently uses service role
```

**Correct option A (soft-delete only, documented):**

```sql
-- No delete policy on work_items. Hard delete must go through a server action
-- using the service role and explicit audit logging. Document in migration.
comment on table public.work_items is 'Soft-delete via status=archived. Hard delete is service-role only.';
```

**Correct option B (admin hard-delete via RLS):**

```sql
drop policy if exists work_items_admin_delete on public.work_items;
create policy work_items_admin_delete on public.work_items
  for delete
  to authenticated
  using (public.get_user_role((select auth.uid())) in ('owner', 'admin'));
```

Notes:

- Pair with `using (...)` only — DELETE has no `with check`.
- If the table is referenced by FK with `on delete cascade`, document the cascade in the migration so admins understand the blast radius before granting delete.
- Hard delete invalidates cache tags; ensure the corresponding server action calls `revalidateTag` for both list and detail tags.

Reference: PostgreSQL DELETE RLS policies; Supabase row-level security guidance.
