# Forms And Actions

**Impact: HIGH** · **Scope: stack (Next.js)**

Mutation forms are UI boundaries around server commands, not business logic containers.

- local or URL-search forms: browser behavior or `onSubmit`; no Server Action.
- simple server mutations: native `<form action>`; add `useActionState` when rendering returned state.
- rich client editing: the project form library, with authoritative server validation.
- server result messages: return typed error keys/categories; localize in the client.
- expected failures: auth, authz, validation, conflict, not found, rate limit.

Do not rely on client validation, hidden fields, disabled buttons, or bound args for authority.
Each Server Action validates its payload, derives applicable identity and tenant from trusted server
state, authorizes the command, calls capability behavior, and returns a public-safe result.

An importable action module starts with top-level `'use server'`. It defines UI commands, not browser
reads. Every value export must be a locally declared async function; call private behavior instead
of re-exporting it.

**Hydration-dependent mutation submit:**

```tsx
<form onSubmit={form.onSubmit(onSubmit)} />
```

**Progressively enhanced Server Action submit:**

```tsx
const [state, formAction, isPending] = useActionState(saveAction, initial)
return <form action={formAction}><button disabled={isPending}>Save</button></form>
```

When a form library manually calls a `useActionState` dispatcher, wrap that call in
`startTransition`. Passing it to `<form action>` or `<button formAction>` starts the transition
automatically.

Fetch current React and form-library docs for syntax. The project rule defines the boundary and
authority.

## Localized Validator Bridge

Keep shared schemas free of client translation. Translate at the form boundary through an adapter
from a Standard Schema-compatible validator to the project form validator.

The adapter accepts a translator and messages keyed by `<path>` or `<path>:<issue-message>`.

```ts
createFormValidator(CreateWorkItemSchema, {
  intl,
  messages: {
    'title': msg.titleRequired,
    'title:too_long': msg.titleTooLong,
  },
})
```

The schema stays shared. Server validation returns issue keys; the client maps them through the same
descriptor table.

Reference: [React form actions](https://react.dev/reference/react-dom/components/form),
[useActionState](https://react.dev/reference/react/useActionState),
[Next.js forms](https://nextjs.org/docs/app/guides/forms).
