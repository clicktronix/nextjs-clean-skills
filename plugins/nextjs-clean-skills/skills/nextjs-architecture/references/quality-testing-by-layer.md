# Testing By Layer

**Impact: HIGH**

Each layer has a different testing target. Mixing strategies across layers (e.g. mocking Supabase inside a domain test) signals a leaky abstraction.

| Layer | What to test | What to mock | Tool surface |
| --- | --- | --- | --- |
| `domain/**` | Schemas accept/reject inputs; pure helpers | Nothing — domain has no I/O | Bun test or Vitest, in-memory |
| `use-cases/**` | Orchestration over ports | A fake repository implementing the port | In-memory mock; never the real Supabase client |
| `adapters/outbound/**` | SQL/API/network adapter shape | Supabase or HTTP client at the lowest possible level | `mock.module('@/adapters/supabase/client', ...)` |
| `adapters/inbound/next/**` | Server Action / Route Handler boundary: parse input, authz, call use-case, invalidate cache | Use-cases, `createApiHandlerContext`, `revalidateTag`/`updateTag` | `mock.module` |
| `ui/**` | Render + interaction | Network calls (TanStack via MSW or `mock.module`); contexts via test render helpers | Testing Library |
| End-to-end | Real database, real auth, real network | Nothing | Playwright; isolated test users |

Notes:

- Tests live next to code under `__tests__/` (co-located).
- `mock.module` mutates module cache globally; include every used export.
- Use `bun test --max-concurrency=1` for CI when tests share env globals.
- Snapshot only stable serializable output (DTOs, JSON envelopes), never full HTML.
- E2E specs must clean up created rows by user/tenant scope.

**Incorrect (use-case test reaches into Supabase):**

```ts
test('archives a work item', async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY)
  await archiveWorkItem({ workItems: createSupabaseWorkItemsRepository(supabase, userId) }, id)
})
```

**Correct (use-case test against an in-memory port):**

```ts
test('archives a work item', async () => {
  const items = new Map<string, WorkItem>([[id, mockItem]])
  const fakeRepo: WorkItemsRepository = {
    archive: async (id) => ({ ...items.get(id)!, status: 'archived' }),
  }
  const result = await archiveWorkItem({ workItems: fakeRepo }, id)
  expect(result.status).toBe('archived')
})
```

Reference: Hybrid Clean Architecture testing; Bun test; Playwright e2e.
