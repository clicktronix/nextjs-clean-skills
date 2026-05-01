# Use `.inputSchema`, Not Legacy Schema APIs

For `next-safe-action` v8, validate inputs with `.inputSchema(...)`.

Valibot works through Standard Schema.

Pattern:
```ts
export const createThing = authActionClient
  .inputSchema(CreateThingSchema)
  .action(async ({ parsedInput, ctx }) => {
    return createThingUseCase(ctx.deps, parsedInput)
  })
```

Do not use legacy safe-action schema method examples in new skills or docs.
