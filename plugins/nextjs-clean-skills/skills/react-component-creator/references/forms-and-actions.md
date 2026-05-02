# Forms And Actions

**Impact: HIGH**

Forms are UI boundaries around Server Actions. They are not business logic containers.

Default choices:

- simple login/signup/settings/create forms: native `<form action>` with `useActionState` or project safe-action state wrapper.
- rich client editing: Mantine form in `lib.ts`, but mirror validation on the server.
- server result messages: return typed error keys/categories; localize in the client.
- expected failures: auth, authz, validation, conflict, not found, rate limit.

Do not rely on client validation, hidden fields, disabled buttons, or bound args for authority. Server Actions parse input, authorize after parsing, call use-cases, and return public-safe results.

**Incorrect (hydration-only submit):**

```tsx
<form onSubmit={form.onSubmit(onSubmit)} />
```

**Correct (progressive boundary):**

```tsx
const [state, formAction, isPending] = useActionState(saveAction, initial)
return <form action={formAction}><button disabled={isPending}>Save</button></form>
```

Fetch current React/next-safe-action/Mantine docs for exact API syntax. This rule decides the boundary and authority model.

Reference: React progressive forms mapped to project Server Action boundaries.
