# Testing By Layer

**Impact: HIGH**

Test the boundary owned by each layer. Mocking across the wrong boundary signals a leaky architecture.

| Layer | Test | Mock |
| --- | --- | --- |
| `domain/**` | schemas and pure rules | nothing |
| `use-cases/**` | orchestration and outcomes | fake ports |
| `adapters/outbound/**` | SQL/API mapping and errors | lowest transport/client |
| `adapters/inbound/next/**` | parse, authz, use-case call, response/invalidation | use-cases and framework helpers |
| `ui/server-state/**` | query keys, enabled rules, invalidation ownership | actions/API transport |
| `ui/**` | rendering and user interaction | contexts and network boundary |
| e2e | real route, auth, data, browser flow | nothing |

**Incorrect (use-case test reaches Supabase):**

```ts
const repo = createSupabaseUsersRepository(supabase)
await updateUser({ users: repo }, input)
```

**Correct (use-case test uses fake port):**

```ts
const users: UsersRepository = { update: async (input) => ({ id: input.id }) }
await updateUser({ users }, input)
```

Keep tests colocated with the code they protect. Use serialized CI only when shared globals make concurrent tests flaky; prefer fixing shared state first.

Reference: Hybrid Clean Architecture testing strategy.
