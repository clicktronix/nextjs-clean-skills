# Database Resource Ownership

**Impact: HIGH** · **Scope: stack (Supabase)**

Capability imports do not expose SQL coupling hidden inside string literals. A private store in one
capability can call `.from('another_table')` without importing another TypeScript module.

Declare every directly accessed Supabase table and function in
`rules/architecture-contract.json`:

```json
{
  "databaseResources": [
    {
      "kind": "table",
      "name": "work_items",
      "owner": "work-items",
      "consumers": ["work-items"]
    }
  ]
}
```

The owner controls schema meaning, migrations, row mapping, and public contract. Add another
consumer only when the dependency is deliberate and reviewed. Prefer calling the owning
capability's public surface when that preserves policy and vocabulary.

Before adding a consumer, name who owns the resulting projection and policy. Screen placement or a
request to keep the query local does not decide ownership. A direct database consumer is reasonable
only for a deliberately consumer-owned projection that does not duplicate the owner's policy;
otherwise call the owner's narrow public surface. Record that decision in review with the resource
map change.

`check-database-resources.mjs` rejects:

- literal `.from()` or `.rpc()` access absent from the map;
- a caller outside the resource's consumer list;
- dynamic resource names that static analysis cannot attribute.

The check is a narrow Supabase canary. It does not prove ownership for raw SQL, an ORM, views,
migrations, or provider wrappers, and it does not replace explicit grants, RLS, or integration
tests. Migration files remain globally ordered; name the capability owner in the migration comment
when a migration changes more than one resource.

Reference: database names are a second dependency graph and require explicit product ownership.
