# Layers And Imports

**Impact: CRITICAL** · **Scope: portable**

Choose the layer before writing files. Dependency direction is compile-time, not runtime.

| Layer | Owns | May import |
| --- | --- | --- |
| `domain/**` | schemas, types, pure rules, the failure taxonomy | pure helpers, schema libraries |
| `use-cases/*/operations/**` | the scenario body; throws, reports nothing | domain, `ports/**`, `data/**` |
| `use-cases/*/entries/**` | the declaration: validates, normalises, reports once | domain, `boundary/**`, its slice's operations |
| `ports/**` · `boundary/**` | the contracts and the combinator entries declare through | domain |
| `data/**` | data access with no port, plus its `DataContext` | domain |
| `adapters/outbound/**` | implementations of a port | domain, `ports/**` |
| `adapters/inbound/**` | request entries, webhooks | use-case `entries/**`, `data/**`, factories, infrastructure |
| `adapters/inbound/read/**` | server-only authenticated reads | same as inbound |
| `client-cache/**` | keys, invalidation, the browser copy of reads | inbound adapters |
| `app/**` | routes, layouts, server-rendered entries | read entrypoints, UI, inbound, the cache's seeding entry |
| `ui/**` | views and client interaction | UI hooks, client-cache, domain types, local actions |
| `infrastructure/**` | env, auth, logging, cache | domain, technical libraries |

An entry reaching `data/**` has skipped the operation it exists to wrap; an operation reaching `boundary/**` reports the same failure twice, under two names.

`data/**` is what "no seam here" looks like: an outbound adapter satisfies a port and arrives from the composition root; a data module has none. [Dependency Categories](../seams/dependency-categories.md) decides which a dependency gets.

**Incorrect:** an entry whose `execute` calls `usersData.updateProfile` directly.

**Correct (an operation, and the declaration that wraps it):**

```ts
async function updateUserProfileOperation(ctx: Context, input: UpdateUser) {
  return usersData.updateProfile(ctx, input)
}

export const updateUserProfile = defineBoundary({
  name: 'updateUserProfile',
  input: UpdateUserSchema,
  output: UserSchema,
  execute: updateUserProfileOperation,
})
```

Direction alone is not enough: a forward with no declaration behind it holds nothing.

Enforce direction with lint, guarding paths that exist. Resolving specifiers beats matching them, with a guard for unresolvable imports.

Reference: dependency rule from Clean Architecture, applied at compile time.
