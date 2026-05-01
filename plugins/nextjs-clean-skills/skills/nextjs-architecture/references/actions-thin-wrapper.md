# Server Actions Are Thin Wrappers

**Impact: HIGH**

Server Actions should be boundary code.

They do:
- authenticate and authorize
- parse input
- compose outbound dependencies
- call use-cases
- invalidate cache
- return typed results or action state

They do not:
- contain business rules
- expose raw errors to users
- accept trusted authority from hidden fields
- call database operations directly unless the target slice intentionally has no use-case layer

**Incorrect (business rule and raw database call in action):**
```ts
export async function createWorkItemAction(input: CreateWorkItem) {
  if (input.title.length < 3) throw new Error('too short')
  return supabase.from('work_items').insert(input)
}
```

**Correct (validate, compose, call use-case, invalidate):**
```ts
export const createWorkItemAction = authActionClient
  .inputSchema(CreateWorkItemSchema)
  .action(async ({ parsedInput, ctx }) => {
    const deps = { workItems: createSupabaseWorkItemsRepository(ctx.supabase, ctx.userId) }
    const result = await createWorkItem(deps, parsedInput)
    updateTag(`work-items:user:${ctx.userId}`)
    return result
  })
```

Reference: Next.js Server Actions and next-safe-action input validation.
