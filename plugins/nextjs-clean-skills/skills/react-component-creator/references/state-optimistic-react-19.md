# Use React 19 Optimistic State Deliberately

Use optimistic UI when latency would make direct feedback poor.

Good options:

- React `useOptimistic` for local optimistic form/list transitions
- TanStack Query optimistic updates when query cache must update

Rules:

- rollback or reconcile on failure
- disable conflicting destructive actions during pending state
- keep server authority final

Do not duplicate optimistic state in Zustand and TanStack Query for the same data.
