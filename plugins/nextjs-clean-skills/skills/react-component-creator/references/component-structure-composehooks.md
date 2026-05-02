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

Reference: project composeHooks convention.
