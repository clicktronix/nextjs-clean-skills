# Forms And Actions

**Impact: HIGH** · **Scope: stack (Next.js)**

Mutation forms are UI boundaries around server commands, not business logic containers.

- local or URL-search forms: browser behavior or `onSubmit`; no Server Action.
- simple server mutations: native `<form action>`; add `useActionState` when rendering returned state.
- rich client editing: the project form library, with authoritative server validation.

Do not rely on client validation, hidden fields, disabled buttons, or bound args for authority.
Each Server Action validates its payload, derives identity and tenant from trusted state, authorizes
the command, calls capability behavior, and returns a public-safe result.

An importable action module starts with top-level `'use server'`. It defines UI commands, not browser
reads. Every value export must be a locally declared async function; call private behavior instead
of re-exporting it.

Handle expected typed outcomes explicitly, then invoke `redirect()`, `permanentRedirect()`, or
`notFound()`. Do not catch unexpected exceptions into form state; let them reach the single outer
capture owner:

```ts
const outcome = await createWorkItem(command)
if (outcome.status !== 'created') return toActionState(outcome)
redirect(`/work-items/${outcome.item.id}`)
```

`<form onSubmit={form.onSubmit(onSubmit)}>` is hydration-dependent. For progressive enhancement,
pass a Server Action or the `formAction` returned by `useActionState` to `<form action>` and expose
its pending state accessibly.

When a form library manually calls a `useActionState` dispatcher, wrap that call in
`startTransition`. Passing it to `<form action>` or `<button formAction>` starts the transition
automatically.

## Localized Validator Bridge

Keep shared schemas free of translation. At the form boundary, adapt a Standard Schema-compatible
validator to project messages keyed by `<path>` or `<path>:<issue-message>`.

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
