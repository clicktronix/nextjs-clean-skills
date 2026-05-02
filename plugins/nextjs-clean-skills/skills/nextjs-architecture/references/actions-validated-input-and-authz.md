# Validated Input And Authorization

**Impact: HIGH**

Validate Server Action input before running input-dependent authorization.

For `next-safe-action` v8:

- use `.inputSchema(...)`, not legacy schema APIs.
- use Standard Schema-compatible validators such as Valibot v1.
- run ownership, tenant, workflow, and resource checks after parsing.
- derive authority from server context, not raw client input.

Use `.useValidated()` when authorization depends on parsed input such as `resourceId`, `tenantId`, or target `status`.

**Incorrect (authz against raw input):**

```ts
export const updateThing = authActionClient.action(async ({ clientInput, ctx }) => {
  await assertTenant(ctx.userId, clientInput.tenantId)
  return updateThingUseCase(clientInput)
})
```

**Correct (schema then validated authz):**

```ts
export const updateThing = authActionClient
  .inputSchema(UpdateThingSchema)
  .useValidated(async ({ parsedInput, ctx, next }) => {
    await assertTenant(ctx.userId, parsedInput.tenantId)
    return next()
  })
  .action(async ({ parsedInput, ctx }) => {
    return updateThingUseCase(ctx.deps, parsedInput)
  })
```

Do not check ownership against raw form data, hidden fields, bound args, or unparsed JSON. Client validation is UX only.

Reference: next-safe-action v8 `.inputSchema()` and `.useValidated()`.
