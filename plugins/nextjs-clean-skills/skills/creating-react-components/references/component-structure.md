# Component Structure

**Impact: HIGH** · **Scope: stack (React)**

Call Hooks directly from named Client Components or named custom Hooks. Do not pass Hooks through a
generic higher-order helper.

Controllers own Hook calls and events; Views render props. A named custom Hook owns one browser
lifecycle. Keep types colocated until reused.

```tsx
'use client'

export function WorkItems(props: WorkItemsProps) {
  const viewProps = useWorkItemsProps(props)
  return <WorkItemsView {...viewProps} />
}
export const WorkItemsView = (props: WorkItemsViewProps) => <Table {...props} />
```

Call Hooks from components or custom Hooks, not through values. A factory such as
`withHooks(View)(useProps)` hides the call behind a variable, can evade Hooks linting, and prevents
automatic optimization. Inline the behavior in a named Hook.

When a View is split for server reuse, keep its file free of `'use client'`, client Hooks, and
browser-only imports. Do not add a third file to complete a template.

## State Ownership Before Provider Splitting

Move frequently updated state into the smallest subtree that owns it. Keep fetched data, mutation
state, and per-keystroke form state separate when their consumers or update frequencies differ.
Use props while the contract remains clear; add colocated Context only when sibling consumers need
the same state and prop composition no longer preserves local reasoning.

If Context is needed, split it by consumer set and update frequency. Server-only stats should not
subscribe to draft values; live counts and previews may. A form should not subscribe to unrelated
mutation or refetch state. Splitting Context isolates its consumers, but parent renders may still
rerender children.

Stabilize each provider value only when identity changes cause measured work. One object containing
unrelated slices invalidates all its consumers when any slice changes.

```tsx
const dataValue = useMemo(() => ({ workItem, labels }), [workItem, labels])
const formStateValue = useMemo(() => ({ values, errors }), [values, errors])
```

Do not create a fixed set of providers to complete a pattern. Use provider splitting only when the
cost is justified by independent consumers, measured rerender work, or a prop contract that no
longer supports local reasoning. A small View stays a plain component.

Reference: [React calls Components and Hooks](https://react.dev/reference/rules/react-calls-components-and-hooks),
[useContext](https://react.dev/reference/react/useContext); project deletion-test convention.
