# Progressive Forms Use Action State

**Impact: HIGH**

For forms that should work before hydration, use:

- React `useActionState` with `<form action={dispatch}>`, or
- `next-safe-action` `.stateAction()` when available.

Good cases:

- login
- signup
- settings save
- simple create/update forms

Use client-only submit handlers only when rich client interaction is required.

**Incorrect (form depends on hydrated JavaScript):**

```tsx
<form onSubmit={form.onSubmit(onSubmit)}>
  <button type="submit">Save</button>
</form>
```

**Correct (native form action):**

```tsx
const [result, formAction, isPending] = useActionState(saveProfileAction, {})

return (
  <form action={formAction}>
    <input name="name" />
    <button disabled={isPending}>Save</button>
  </form>
)
```

`useActionState` can surface the Server Function's returned state before hydration. Use the optional `permalink` argument when the form lives on a feed/detail URL and React needs a stable URL to replay the response. Redirect only when success should navigate to another page.

```ts
const [state, formAction] = useActionState(saveProfileAction, {}, '/profile')
```

If the action does call `redirect()`, keep it outside `try/catch` because Next throws a `NEXT_REDIRECT` control-flow error.

Reference: React `useActionState` progressive enhancement and next-safe-action `.stateAction()`.
