# Route `_internal` Is Private

Use `_internal/` for code owned by one App Router segment.

Allowed:

- `src/app/(protected)/admin/work-items/_internal/ui/**`
- route-local stores, hooks, messages, and small utilities

Not allowed:

- importing another segment's `_internal/**`
- placing shared components under `_internal`
- using `_internal` as an architecture layer

Move reusable UI to `src/ui/components/**`, reusable state to `src/ui/stores/**`, and business logic to domain/use-cases.
