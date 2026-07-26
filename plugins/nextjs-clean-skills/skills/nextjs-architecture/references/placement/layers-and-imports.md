# Layers And Imports

**Impact: CRITICAL** · **Scope: portable**

Place files before coding; import direction is compile-time.

<!-- contract:layer-table -->
| Layer | Owns | Same layer | Across layers |
| --- | --- | --- | --- |
| `domain/**` | pure rules and domain types | yes | none |
| `use-cases/*/operations/**` | application orchestration and projections | yes | domain, ports, data |
| `use-cases/*/entries/**` | public validation, failure normalization, and reporting | no | domain, boundary, use-case-operations |
| `data/**` | local store access when no port exists | yes | domain |
| `adapters/outbound/**` | application port implementations | yes | domain, ports |
| `adapters/inbound/**` | request authorization and command or event composition | yes | domain, ports, data, outbound, infrastructure, boundary, use-case-entries |
| `adapters/inbound/read/**` | authenticated server-only reads | yes | domain, ports, data, outbound, infrastructure, inbound, boundary, use-case-entries |
| `client-cache/**` | browser cache and invalidation | yes | domain, inbound |
| `ui/**` | presentation and client interaction | yes | domain, client-cache |
| `app/**` | routing, rendering, and metadata | yes | domain, read, inbound, ui, client-cache (prefetch only) |
| `infrastructure/**` | environment, auth, logging, and cache plumbing | yes | domain |
| `ports/**` | application capability contracts | no | domain |
| `boundary/**` | shared declaration policy | no | domain |
<!-- /contract:layer-table -->

Self-imports: operations yes; entries, ports, and boundary no.

Entry -> data skips the operation; operation -> boundary reports twice.

`data/**` means no port; [Dependency Categories](../seams/dependency-categories.md) decides.

Examples are linted:

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

A forwarding operation owns nothing. `profileEdit` earns this file.
