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
- collapse expected auth/validation/conflict failures into generic internal errors
- accept trusted authority from hidden fields
- call database operations directly unless the target slice intentionally has no use-case layer

**Incorrect (business rule and raw database call in action):**

```ts
export async function createWorkItemAction(input: CreateWorkItem) {
  if (input.title.length < 3) throw new Error("too short");
  return supabase.from("work_items").insert(input);
}
```

**Correct (validate, compose, call use-case, invalidate):**

```ts
export const createWorkItemAction = authActionClient
  .inputSchema(CreateWorkItemSchema)
  .action(async ({ parsedInput, ctx }) => {
    const deps = {
      workItems: createSupabaseWorkItemsRepository(ctx.supabase, ctx.userId),
    };
    const result = await createWorkItem(deps, parsedInput);
    updateTag(`work-items:user:${ctx.userId}`);
    return result;
  });
```

Reference: Next.js Server Actions and next-safe-action input validation.

## Error Boundary Contract

Server Actions are also the boundary where technical failures become public action results.

- Preserve expected categories: authentication, authorization, validation, conflict, not found, and rate limit.
- Convert those categories to the repo's public error-code or field-error format.
- Keep unexpected infrastructure details internal.
- Add tests for the mapping, especially login/signup and form submissions.

**Incorrect (all server errors become internal):**

```ts
handleServerError(error) {
  logger.error(error)
  return '[INTERNAL_ERROR] action'
}
```

**Correct (expected API errors keep user-safe semantics):**

```ts
handleServerError(error) {
  logger.error(error)

  if (isApiError(error)) {
    return toPublicActionError(error.status).message
  }

  return createActionError(INTERNAL_ERROR, 'action').message
}
```

Use Route Handlers instead when the caller is an external HTTP client, webhook, queue callback,
or command that must own HTTP headers/status/idempotency.

Reference: [Route Handlers For Service APIs](api-route-handlers-for-service-apis.md)
