# Component Structure And Static Hook Calls

**Impact: HIGH**

Call Hooks statically inside a component or another custom Hook. Do not pass a Hook through
`composeHooks`, props, dependency injection, or another generic higher-order helper. React requires
Hooks to remain visible as direct calls so component behavior supports local reasoning and automatic
optimization.

Project file convention:

| File | Owns |
| --- | --- |
| `index.tsx` | exported Controller and View while both remain readable |
| `lib.ts` | `use<Props>` hook, view-model mapping, callbacks |
| `interfaces.ts` | shared or numerous local types |
| `*.module.css` | custom styling not covered by Mantine props |

The Controller calls the named custom Hook directly and passes plain props to the View. The View
should be declarative and side-effect free. `lib.ts` may use Hooks, compose state sources, and create
stable handlers. Keep Controller and View in one file by default; split `view.tsx` only when the View
has independent reuse, tests, or a server-compatible render path.

Import concrete files; do not add barrel re-exports or namespace objects.

## Controller And View

**Correct shape:**

```tsx
export function WorkItemsView(props: ViewProps) { return <Table {...props} /> }

export function WorkItems(props: Props) {
  const viewProps = useWorkItemsProps(props)
  return <WorkItemsView {...viewProps} />
}
```

## Compound Provider Split

When a View reaches 30+ props or several independent sections, split it into sub-components and
colocated contexts grouped by re-render frequency:

- `Data` for fetched entities and derived maps.
- `Mutations` for stable callbacks and their flags.
- A `FormState` context for per-keystroke values and errors.
- A `FormActions` context for `onChange`/`onSubmit` (stable).

Each sub-component subscribes only to what it renders. Memoize each context value with its own
dependencies; one combined memo invalidates every slice.

```tsx
const dataValue = useMemo(() => ({ blog, labels }), [blog, labels])
const formStateValue = useMemo(() => ({ values, errors }), [values, errors])
```

Require three or more sections, measured re-render cost, or an off-screen prop list. Keep small
Views as a Controller/View pair or one component.

Reference: React's rule to call Hooks statically inside components or Hooks.
