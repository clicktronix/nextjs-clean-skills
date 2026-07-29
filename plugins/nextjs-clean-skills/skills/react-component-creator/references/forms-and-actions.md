# Forms And Actions

**Impact: HIGH** · **Scope: stack (Next.js + Mantine)**

Forms are UI boundaries around Server Actions. They are not business logic containers.

Default choices:

- simple login/signup/settings/create forms: native `<form action>` with `useActionState` or project safe-action state wrapper.
- rich client editing: use the project's form library in a named component or Hook, with
  authoritative validation on the server.
- server result messages: return typed error keys/categories; localize in the client.
- expected failures: auth, authz, validation, conflict, not found, rate limit.

Do not rely on client validation, hidden fields, disabled buttons, or bound args for authority.
Server Actions parse input, derive identity and tenant on the server, call the capability's server
service or application operation, and return public-safe results.

An importable action module starts with top-level `'use server'`. Server Actions are UI command
boundaries, not transports for browser reads. Next.js requires value exports from that module to be
locally declared async functions. Import private behavior and call it from the action; do not
value-re-export it.

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

Domain schemas stay pure because application policy, private adapters, and client forms may all use
them. They do not import the client `intl` instance. Translation happens at the form boundary in a
small adapter from a Standard Schema-compatible validator to a Mantine form validator.

The adapter accepts optional `intl` and a `messages` map keyed by `<path>` or
`<path>:<issue-message>`, then falls back to the raw issue when no descriptor exists.

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

The schema stays shared. Server validation returns issue keys; the client maps them through the same
descriptor table.

Reference: React progressive forms mapped to project Server Action boundaries.
