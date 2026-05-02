# Use State Actions For Progressive Forms

**Impact: CRITICAL for login/signup/settings forms**

Forms that should work before hydration should use:

- React `useActionState` with `<form action={dispatch}>`, or
- `next-safe-action` `.stateAction()` when the repo uses next-safe-action.

Use this for login, signup, settings, and simple CRUD forms.

**Incorrect (client-only submit path):**

```tsx
<form onSubmit={handleSubmit}>
  <button type="submit">Sign in</button>
</form>
```

**Correct (state action receives parsed input and previous result):**

```ts
export const loginAction = actionClient
  .inputSchema(LoginFormDataSchema)
  .stateAction(async ({ parsedInput }, { prevResult }) => {
    return loginUser(parsedInput, prevResult.data)
  })
```

```tsx
const [result, formAction, isPending] = useActionState(loginAction, {})
return (
  <form action={formAction}>
    <button disabled={isPending}>Sign in</button>
  </form>
)
```

Use TanStack mutations only when the form also needs client cache behavior such as optimistic updates, shared query invalidation, or realtime coordination.

`useStateAction` is still available in next-safe-action. Prefer native `useActionState` for no-JS progressive enhancement; do not describe `useStateAction` as deprecated.

Reference: next-safe-action form actions and React `useActionState`.
