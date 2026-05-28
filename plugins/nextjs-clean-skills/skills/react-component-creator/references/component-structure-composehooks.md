# Component Structure And composeHooks

**Impact: HIGH**

Use `composeHooks(View)(useProps)` for Client Components with non-trivial logic. Skip it for pure Server Components and simple presentation components.

Project file convention:

| File | Owns |
| --- | --- |
| `index.tsx` | View component and exported composed component |
| `lib.ts` | `use<Props>` hook, view-model mapping, callbacks |
| `interfaces.ts` | shared or numerous local types |
| `*.module.css` | custom styling not covered by Mantine props |

The View should be declarative and side-effect free. `lib.ts` may use hooks, compose state sources, and create stable handlers.

Do not create barrel `index.ts` re-export files. Do not export namespace objects. Import concrete files directly; this avoids RSC namespace export traps and keeps tree-shaking predictable.

**Correct shape:**

```tsx
export function WorkItemsView(props: ViewProps) { return <Table {...props} /> }
export const WorkItems = composeHooks<ViewProps, Props>(WorkItemsView)(useWorkItemsProps)
```

## Compound Provider Split

When a feature view takes 30+ props or contains several independent sections, stop growing the View prop list. Split the View into sub-components and pass state through colocated context providers instead. Split contexts by re-render frequency, not by "what feels related":

- A `Data` context for fetched entity + derived/label maps (stable until refetch).
- A `Mutations` context for action callbacks (stable via `useCallback`) and the small subset of flags those callbacks toggle (`isEditing`, `isSaving`).
- A `FormState` context for per-keystroke values and errors.
- A `FormActions` context for `onChange`/`onSubmit` (stable).

Sub-components subscribe only to what they render. A `Stats` block that reads only `Data` does not re-render on form input. A `Header` reading `Mutations` does not re-render on data refetch.

Build each context value with its own `useMemo` and per-slice deps. Bundling unrelated slices into one memo invalidates them together.

```tsx
const dataValue = useMemo(() => ({ blog, labels }), [blog, labels])
const formStateValue = useMemo(() => ({ values, errors }), [values, errors])
```

Use this pattern only when the cost is justified — three or more sub-sections, measurable re-render cost, or a prop list that has stopped fitting on one screen. A small View stays a `composeHooks` pair.

Reference: project composeHooks convention.
