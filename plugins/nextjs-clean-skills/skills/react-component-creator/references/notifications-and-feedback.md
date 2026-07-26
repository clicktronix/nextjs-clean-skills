# Notifications And Feedback

**Impact: MEDIUM** · **Scope: stack (Mantine + TanStack)**

Stack convention (Mantine + TanStack Query + i18n), not portable architecture — adapt names. Prerequisite: the inbound boundary maps application errors to public codes/results that `presentError` can format — see [Error Taxonomy](../../nextjs-architecture/references/errors/error-taxonomy.md).

Scattered notification calls drift in copy, color, icon, and error mapping. Centralize feedback behind small helpers and a single confirm boundary.

## Semantic Notify Helpers

Expose feature-agnostic `notifyError`, `notifySuccess`, `notifyInfo`, and `notifyWarning` helpers. They accept i18n copy/values and apply semantic color, icon, and duration defaults.

Colors are semantic theme tokens (`success`, `warning`, `info`, `danger`) registered in the Mantine theme, never hex literals.

```ts
notifyError({ intl, title: msg.saveFailed, error })
notifySuccess({ intl, title: msg.saved })
```

With an `error` but no `message`, `notifyError` formats through `presentError(error)` so copy stays consistent with the inbound adapter's public error taxonomy.

## Global Mutation Error Notifier

Prefer one app-level notifier with an opt-out for mutations that own their UX. Local `onError` handlers remain for rollback or inline state.

Configure public `MutationCache.onError`; do not depend on cache subscription events.

```ts
const mutationCache = new MutationCache({
  onError: (error, _variables, _onMutateResult, mutation) => {
    if ((mutation.meta as { silent?: boolean })?.silent) return
    notifyError({ intl, error })
  },
})
```

Install the cache in `QueryClient`. The global callback still runs with local handlers; use `meta.silent` when a mutation owns all feedback.

## Unified Confirm Hook

Replace ad-hoc confirm helpers with one `useConfirm` hook using a `kind: 'action' | 'delete' | 'destructive'` discriminator for color and default copy.

Callers stay short:

```ts
confirm({ kind: 'delete', title: msg.deleteTitle, message: msg.deleteMessage, onConfirm })
```

Reference: project notification and confirm conventions.
