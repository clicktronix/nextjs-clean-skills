# Notifications And Feedback

**Impact: MEDIUM** · **Scope: stack (TanStack Query)**

The runtime channel maps semantic application failures to public results that the presenter can
format. See
[Error Taxonomy](../../nextjs-architecture/references/errors/error-taxonomy.md).

Scattered calls drift in copy, severity, and error mapping. Centralize notifications behind small
helpers and use one confirmation boundary.

## Semantic Notify Helpers

Expose feature-agnostic `notifyError`, `notifySuccess`, `notifyInfo`, and `notifyWarning` helpers.
They accept localized copy and apply semantic icon, color, and duration defaults.

Use theme tokens such as `success`, `warning`, `info`, and `danger`, not color literals.

```ts
notifyError({ intl, title: msg.saveFailed, error })
notifySuccess({ intl, title: msg.saved })
```

With an `error` but no `message`, `notifyError` formats through the shared error presenter so copy
stays consistent with the channel's public error taxonomy.

A notification is not an error boundary. Route-level render failures belong to
[Loading And Errors](./loading-and-errors.md); notifications report the outcome of an action the
user just took.

## Global Mutation Error Notifier

Use an app-level notifier for mutations whose default failure UX is global. Mutations with inline or
rollback UX opt out through typed metadata; local handlers still own that work.

Configure the public mutation-error callback; do not infer failures from cache subscription events:

```ts
const mutationCache = new MutationCache({
  onError: (error, _variables, _onMutateResult, mutation) => {
    if ((mutation.meta as { silent?: boolean })?.silent) return
    notifyError({ intl, error })
  },
})
```

Install the cache in the query client. Its callback runs in addition to local handlers; mark a
mutation silent when it owns all feedback.

## Unified Confirm Hook

Replace ad hoc confirm helpers with one `useConfirm` Hook. A
`kind: 'action' | 'delete' | 'destructive'` discriminator selects semantics and default copy.

Callers stay short:

```ts
confirm({ kind: 'delete', title: msg.deleteTitle, message: msg.deleteMessage, onConfirm })
```

The dialog moves focus inside on open. On close, return focus to the trigger or the next logical
control if the trigger no longer exists.

Reference: [MutationCache](https://tanstack.com/query/v5/docs/reference/MutationCache),
[modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
