# Layers And Imports

**Impact: CRITICAL** · **Scope: portable**

Choose the layer before writing files. Dependency direction is compile-time, not runtime.

| Layer | Owns | May import |
| --- | --- | --- |
| `domain/**` | schemas, types, pure rules, the failure taxonomy | pure helpers, schema libraries |
| `use-cases/**` | scenarios and feature types | domain, `ports/**`, `data/**`, `boundary/**` |
| `ports/**` · `boundary/**` | the contracts, and the combinator every entry is declared through | domain |
| `data/**` | data access with no port, plus its `DataContext` | domain |
| `adapters/outbound/**` | implementations of a port: services, external APIs | domain, `ports/**`, `boundary/**` |
| `adapters/inbound/**` | request entries, webhooks | use-cases, `data/**`, factories, infrastructure |
| `adapters/inbound/read/**` | server-only authenticated reads | same as inbound |
| `client-cache/**` | keys, invalidation, the browser copy of reads | inbound adapters |
| `app/**` | routes, layouts, metadata, server-rendered entries | read entrypoints, UI, inbound adapters, the client cache's seeding entry |
| `ui/**` | views and client interaction | UI hooks, client-cache, domain types, local actions |
| `infrastructure/**` | env, auth, logging, cache, wrappers | domain, technical libraries |

Forbidden everywhere: use-cases importing inbound or outbound adapters, database clients, UI primitives, client cache libraries, or framework request and cache APIs.

`data/**` is not an exception — it is what "no seam here" looks like. An outbound adapter satisfies a port and arrives from the composition root; a data module has none, so callers import it directly. [Dependency Categories](../seams/dependency-categories.md) decides which a dependency gets.

**Incorrect (constructs its own collaborator, and holds nothing):**

```ts
export async function updateUser(input) {
  return createUsersRepository().update(input)
}
```

**Correct (declared scenario over a data module):**

```ts
export const updateUserProfile = defineBoundary({
  name: 'updateUserProfile',
  input: UpdateUserSchema,
  output: UserSchema,
  run: (ctx, input) => usersData.updateProfile(ctx, input),
})
```

The second form is correct about direction *and* carries the wrapper's guarantees. Direction alone is not enough: an unwrapped forward holds nothing, whichever way its imports point.

Enforce direction with lint, guarding paths that exist. Resolving specifiers beats matching them, with a guard for unresolvable imports.

Reference: dependency rule from Clean Architecture, applied at compile time.
