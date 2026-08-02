# State Placement

**Impact: HIGH** · **Scope: stack (React)**

Put state where its owner lives. Do not pick a store by preference. The canonical state-kind table
lives in [SKILL.md](../SKILL.md). This file covers escalation and decomposition.

Do not copy server data into Context, a store, or `useState` unless creating an explicit draft.
Browser-owned server data belongs to the capability's `client/` lifecycle. Do not use a server-state
library for local UI state. Selectors, persistence, or measured update pressure must justify an
external store. Compute derived values; do not synchronize them into state with an Effect.

When Client islands share UI state, start with a colocated Context provider. Move to a store when
profiling shows Context churn or persistence, devtools, or selectors are real requirements. Do not
add a store dependency to a project that intentionally has none.

## Explicit Variants Over Mode Discriminators

Split a `mode: 'view' | 'edit' | 'create'` component when mode-specific props or branches make its
contract conditional. Use one component per mode. The dispatcher only narrows route state and
selects a variant; data loading, Hooks, and interaction stay inside that variant.

```tsx
function DetailPanelSlot() {
  const { mode, workItemId, boardId } = useRouteState()
  if (mode === 'create') {
    if (!boardId) return null
    return <WorkItemPanelCreate boardId={boardId} />
  }
  if (!workItemId) return null
  if (mode === 'edit') return <WorkItemPanelEdit workItemId={workItemId} />
  return <WorkItemPanelView workItemId={workItemId} />
}
```

Each variant owns its mode-specific data and interaction. A Client variant may use a bindings Hook;
a Server variant need not. Prefer a discriminated route-state type when the project has one. Move
shared chrome into a `<PanelFrame title body footer />` shell. Load heavy variants on demand only
when measurements justify it.

Split when the shared contract admits invalid prop combinations or mode branches spread through
data loading, Hooks, or presentation. Prop guard comments, repeated non-null assertions, and a
materially heavier variant are evidence, not a numeric threshold.

Reference: [State Placement](../SKILL.md#state-placement).
