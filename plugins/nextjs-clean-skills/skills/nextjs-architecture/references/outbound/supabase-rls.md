# Supabase And Row-Level Security

**Impact: CRITICAL** · **Scope: stack (Supabase / Postgres)**

One instance of [Authority And Transactions](authority-and-transactions.md), for projects where the store holds authority and that
store is Supabase. A project that keeps authority in its own backend service applies that
document and skips this one.

The client belongs behind the data module for the slice, or behind an outbound adapter when a
port is warranted. UI never imports it, and use-cases never import the client itself.

RLS guardrails:

- enable RLS for user and tenant data
- prefer `(select auth.uid())` in policies so the call is evaluated once per statement
- pair an update `using` clause with `with check`, or a caller can turn rows they own into rows
  they should not own
- use private `security definer` helpers only for role or membership lookups that would otherwise
  recurse through protected tables

Policies are the last line, not the only one. An unauthorized caller should meet a clear refusal
at the entry point rather than an empty result set that reads like missing data.

Scoped batch write, with the actor predicate inside the statement:

```sql
CREATE FUNCTION public.reorder_in_column(actor_id uuid, updates jsonb) RETURNS SETOF campaigns
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.campaigns c SET column_id = u.column_id, position = u.position
  FROM jsonb_to_recordset(updates) AS u(id uuid, column_id uuid, position int)
  WHERE c.id = u.id AND c.created_by = actor_id RETURNING c.*;
$$;
```

Use tenant or parent scope where that is the domain authority. Never publish an unscoped bulk
update.

`SECURITY INVOKER` keeps the caller's policies in force. Reach for `SECURITY DEFINER` only when
the function must read rows the caller cannot, and then pin `search_path` and scope the predicate
by hand — the policies are no longer doing it for you.

Filter input reaching `ilike` or `.or()` is escaped once, by one function covering both the
pattern wildcards and the filter grammar; escape backslash first, or later replacements
double-escape what it added.

For exact SQL syntax and performance details, fetch current Supabase docs.

Reference: Supabase behind the data boundary; RLS as database-side authority.
