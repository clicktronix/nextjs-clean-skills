# Do Not Bind Secrets To Actions

**Impact: CRITICAL**

Bound Server Action arguments can be represented client-side.

Do not bind:
- secrets
- service-role keys
- user roles
- trusted user IDs
- tenant authority

If using `next-safe-action`, validate bound arguments with `.bindArgsSchemas()` and derive authority from server context.

Hidden fields and bound args are input, not trust.

**Incorrect (trusted authority bound from render):**
```tsx
const updateForUser = updateUserAction.bind(null, user.id, user.role)
return <form action={updateForUser}><button>Save</button></form>
```

**Correct (derive authority server-side):**
```ts
export const updateUserAction = authActionClient
  .inputSchema(UpdateUserSchema)
  .action(async ({ parsedInput, ctx }) => {
    return updateCurrentUser({ users: ctx.users }, ctx.userId, parsedInput)
  })
```

Reference: Next.js Server Actions security guidance.
