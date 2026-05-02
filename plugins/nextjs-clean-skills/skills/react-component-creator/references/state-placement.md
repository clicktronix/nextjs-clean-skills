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

Reference: project state ownership model.
