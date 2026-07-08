# Notifications And Feedback

**Impact: MEDIUM**

Stack convention (Mantine + TanStack Query + i18n), not portable architecture — adapt names. Judgment call: *where* feedback lives (one notifier vs scattered `onError`). **Prerequisite:** `notifyError(..., { error })` formats via the `ApiError`/`presentError` error-mapping layer (adapters map SQLSTATE/PostgREST codes to typed `ApiError`s — the nextjs-architecture skill's "Supabase Persistence Boundaries" reference) — build that first.

Scattered notification calls drift in copy, color, icon, and error mapping. Centralize feedback behind small helpers and a single confirm boundary.

## Semantic Notify Helpers

Expose `notifyError`, `notifySuccess`, `notifyInfo`, `notifyWarning` in a feature-agnostic module. Each helper accepts `intl`, a title descriptor or string, an optional message, and an optional `values` map. Each applies semantic defaults: color, icon, and `autoClose` duration (errors stay longer than confirmations).

Colors are semantic theme tokens (`success`, `warning`, `info`, `danger`) registered in the Mantine theme, never hex literals.

```ts
notifyError({ intl, title: msg.saveFailed, error })
notifySuccess({ intl, title: msg.saved })
```

With an `error` but no `message`, `notifyError` formats through `presentError(error)` so copy stays consistent with the inbound adapter's `ApiError` taxonomy.

## Global Mutation Error Notifier

Mutation error handlers duplicate across hooks. Prefer one app-level notifier for unhandled mutation errors, with an opt-out flag for mutations that own their UX (inline form errors, optimistic rollback toasts).

Local `onError` handlers stay only for rollback logic. Notification is the notifier's job.

```ts
queryClient.getMutationCache().subscribe((event) => {
  if (event.type !== 'updated' || event.action.type !== 'error') return
  if ((event.mutation.meta as { silent?: boolean })?.silent) return
  notifyError({ intl, error: event.action.error })
})
```

Mount the notifier inside the query provider so it sees every mutation in the app.

## Unified Confirm Hook

Replace ad-hoc `useConfirmAction`, `useConfirmDelete`, and inline `modals.openConfirmModal` calls with one `useConfirm` hook that takes a `kind: 'action' | 'delete' | 'destructive'` discriminator. The hook applies the right color (info or danger), the right default copy, and the right confirm-button label per kind.

Callers stay short:

```ts
confirm({ kind: 'delete', title: msg.deleteTitle, message: msg.deleteMessage, onConfirm })
```

Reference: project notification and confirm conventions.
