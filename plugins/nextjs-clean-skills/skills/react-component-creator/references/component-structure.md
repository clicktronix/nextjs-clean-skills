# Component Structure

**Impact: HIGH** · **Scope: stack (React)**

Call Hooks directly from named Client Components or named custom Hooks. Do not pass Hooks through a
generic higher-order helper.

The controller owns direct Hook calls and event composition. The View renders props. A named custom
Hook owns a coherent browser lifecycle or reusable interaction. Keep types colocated until another
file owns them.

**Correct shape:**

```tsx
'use client'

export function WorkItems(props: WorkItemsProps) {
  const viewProps = useWorkItemsProps(props)
  return <WorkItemsView {...viewProps} />
}
export const WorkItemsView = (props: WorkItemsViewProps) => <Table {...props} />
```

React's rule is explicit: Hooks are called from components or Hooks and are not passed as regular
values. A generic `composeHooks(View)(useProps)` helper hides the call behind a variable, weakens
local reasoning, and inhibits automatic optimization.

Keep both components in one file while readable. Split the View into a file without `'use client'`
when it needs independent tests or server rendering. Do not create a third file merely to complete a
template.

## Compound Provider Split

When independently updated subtrees consume different state slices, split the View and use
colocated providers only when prop composition no longer preserves local reasoning. Split by update
frequency and consumer set:

- A `Data` context for fetched entity + derived/label maps (stable until refetch).
- A `Mutations` context for stable action callbacks and their small status set.
- A `FormState` context for per-keystroke values and errors.
- A `FormActions` context for `onChange`/`onSubmit` (stable).

Sub-components subscribe only to what they render. `Stats` reading `Data` does not rerender on form
input; `Header` reading `Mutations` does not rerender on data refetch.

Build each context value independently when stable identity is required. Bundling unrelated slices
invalidates them together.

```tsx
const dataValue = useMemo(() => ({ blog, labels }), [blog, labels])
const formStateValue = useMemo(() => ({ values, errors }), [values, errors])
```

Use provider splitting only when the cost is justified: independent sub-sections, measured rerender
cost, or a prop contract that no longer supports local reasoning. A small View stays a plain
component.

Reference: React rules for direct Component and Hook calls; project deletion-test convention.
