# State Placement

**Impact: HIGH**

Put state where its owner lives. Do not pick a store by preference.

| State kind | Owner |
| --- | --- |
| read-heavy server data | RSC props from DAL/read entrypoints |
| client async server-state | TanStack Query, only for realtime/polling/infinite/optimistic/shared async lifecycle |
| URL-shareable filters/tabs/page | URL search params |
| controlled form state | form hook in `lib.ts` |
| one-route UI state | feature-local `useState`/`useReducer` hook |
| static global UI config | React Context |
| hot shared UI state | external store with selectors, e.g. Zustand, only if the target repo includes it and the need is measured |
| derived values | calculation or `useMemo`, not synced effects |

Do not put server data in Context, Zustand, or `useState`. Do not use TanStack Query for local UI state. Do not use Zustand just because "stores feel cleaner".

If multiple unrelated Client islands share UI state, start with a colocated Context provider. Move to an external store when profiling shows Context churn or when persistence/devtools/selectors are real requirements. Do not add Zustand to a template that intentionally has no Zustand dependency.

## Explicit Variants Over Mode Discriminators

When a component takes `mode: 'view' | 'edit' | 'create'` with prop subsets that are only valid in some modes (commented as such, or guarded by `if (mode === ...)` inside the View), decompose it into one component per mode plus a thin dispatcher.

```tsx
function SidebarSlot() {
  const { mode, blogId, personId } = useRouteState()
  if (mode === 'create') {
    if (!personId) return null
    return <BlogSidebarCreate personId={personId} />
  }
  if (!blogId) return null
  if (mode === 'edit') return <BlogSidebarEdit blogId={blogId} />
  return <BlogSidebarView blogId={blogId} />
}
```

Each variant owns its bindings hook (`useBlogViewBindings`, `useBlogEditForm`, `useBlogCreateForm`), so type narrowing is automatic and "only valid when mode = X" prop comments disappear. Prefer a discriminated route-state type when the target repo has one. Shared chrome moves into a `<SidebarFrame title body footer />` shell. Heavy variants can be lazily loaded by the dispatcher; the view variant stays light.

Use this when at least two of: the prop list has guard comments, the View has `if (mode === ...)` branches, non-null assertions would otherwise be needed, or one mode is significantly heavier than the others.

Reference: project state ownership model.
