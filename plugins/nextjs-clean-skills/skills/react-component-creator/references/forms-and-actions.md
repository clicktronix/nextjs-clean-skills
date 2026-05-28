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

## Localized Validator Bridge

Domain schemas must stay pure — they are imported by use-cases and outbound adapters that have no access to the client `intl` instance. Translation happens at the form boundary, in a small adapter that turns a Standard Schema-compatible validator into a Mantine form validator.

The adapter accepts an optional `intl` and a `messages` map keyed by `<path>` or `<path>:<issue-message>`, looks up the descriptor for each issue, and falls back to the raw issue message when no descriptor exists.

```ts
createMantineValidator(CreateBlogSchema, {
  intl,
  messages: {
    'username': msg.usernameRequired,
    'username:invalid_url': msg.usernameInvalidUrl,
    'platform': msg.platformRequired,
  },
})
```

The schema stays shared between server and client. The component imports the schema, the messages, and the bridge. Server validation still parses with the same schema and surfaces raw issue keys; the client maps those keys to the same descriptor table for consistent error copy.

Reference: React progressive forms mapped to project Server Action boundaries.
