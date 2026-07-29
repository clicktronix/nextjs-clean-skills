# Component Structure

**Impact: HIGH** · **Scope: stack (React)**

Call Hooks directly from named Client Components or named custom Hooks. Do not pass Hooks through a
generic higher-order helper.

The controller owns Hook calls and events. The View renders its props. A named custom Hook owns one
browser lifecycle or reusable interaction. Keep types colocated until another file needs them.

**Correct shape:**

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

When the View is split, keep its file free of `'use client'` so it remains server-renderable. Do not
add a third file to complete a template.

## Compound Provider Split

When independently updated subtrees consume different state slices, split the View and use
colocated providers only when prop composition no longer preserves local reasoning. Split by update
frequency and consumer set:

- A `Data` context for fetched entities and derived maps.
- A `Mutations` context for commands and their status.
- A `FormState` context for per-keystroke values and errors.
- A `FormActions` context for form commands.

Each sub-component reads only the contexts it needs. Splitting contexts prevents an unrelated
context update from invalidating its consumers; parent renders can still rerender children.

Stabilize each provider value only when identity changes cause measured work. One object containing
unrelated slices invalidates all its consumers when any slice changes.

```tsx
const dataValue = useMemo(() => ({ workItem, labels }), [workItem, labels])
const formStateValue = useMemo(() => ({ values, errors }), [values, errors])
```

Use provider splitting only when the cost is justified: independent sub-sections, measured rerender
cost, or a prop contract that no longer supports local reasoning. A small View stays a plain
component.

Reference: [React calls Components and Hooks](https://react.dev/reference/rules/react-calls-components-and-hooks),
[useContext](https://react.dev/reference/react/useContext); project deletion-test convention.
