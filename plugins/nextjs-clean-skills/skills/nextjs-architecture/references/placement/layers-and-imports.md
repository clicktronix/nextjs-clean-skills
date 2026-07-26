# Layers And Imports

**Impact: CRITICAL** · **Scope: portable**

Choose the layer before writing files. Direction is compile-time, not runtime.

<!-- contract:layer-table -->
| Layer | May import |
| --- | --- |
| `domain/**` | nothing in src/ |
| `use-cases/*/operations/**` | domain, ports, data |
| `use-cases/*/entries/**` | domain, boundary, use-case-operations |
| `data/**` | domain |
| `adapters/outbound/**` | domain, ports |
| `adapters/inbound/**` | domain, ports, data, outbound, infrastructure, read, boundary, use-case-entries |
| `adapters/inbound/read/**` | domain, ports, data, outbound, infrastructure, inbound, boundary, use-case-entries |
| `client-cache/**` | domain, inbound |
| `ui/**` | domain, client-cache, ui |
| `app/**` | domain, read, inbound, ui, client-cache (prefetch only) |
| `infrastructure/**` | domain |
| `ports/**` | domain |
| `boundary/**` | domain |
<!-- /contract:layer-table -->

An entry reaching `data/**` skipped the operation it wraps; an operation reaching `boundary/**` reports it twice.

`data/**` is "no seam here": an outbound adapter satisfies a port and arrives from the root; a data module has none. [Dependency Categories](../seams/dependency-categories.md) decides.

Two files, both linted against this table in CI:

```ts path=src/use-cases/work-items/operations/update-profile.ts
import { usersData } from '@/data/users'
import { profileEdit } from '@/domain/user/profile'

export const updateUserProfileOperation = (ctx, input) =>
  usersData.updateProfile(ctx, profileEdit(input))
```

```ts path=src/use-cases/work-items/entries/update-profile.ts
import { defineBoundary } from '@/boundary'
import { UpdateUserSchema, UserSchema } from '@/domain/user/profile'
import { updateUserProfileOperation } from '../operations/update-profile'

export const updateUserProfile = defineBoundary({
  name: 'updateUserProfile',
  input: UpdateUserSchema,
  output: UserSchema,
  execute: updateUserProfileOperation,
})
```

Direction is not depth: an operation that only forwards holds nothing, and no declaration around it changes that. `profileEdit` earns the file.

Reference: the dependency rule, applied at compile time.
