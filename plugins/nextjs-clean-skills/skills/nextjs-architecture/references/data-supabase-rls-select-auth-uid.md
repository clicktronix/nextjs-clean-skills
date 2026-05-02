# Supabase RLS Uses `(select auth.uid())`

Enable RLS on tables with user or tenant data.

Policy guidance:

- prefer `(select auth.uid())` instead of repeated direct `auth.uid()` calls
- index columns referenced in policies
- keep service role access in server-only modules
- validate returned rows before exposing them

Example:

```sql
create policy "Users can read own rows"
on work_items for select
using (user_id = (select auth.uid()));
```
