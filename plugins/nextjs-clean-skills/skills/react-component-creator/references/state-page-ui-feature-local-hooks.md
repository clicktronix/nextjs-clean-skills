# Page UI State In Feature-Local Hooks

**Impact: MEDIUM**

Page UI state — selected rows, drawer open/close, multi-panel coordination, local sort/view mode — lives in feature-local hooks using `useState`/`useReducer`, scoped to the route segment that owns the UI. It is the default; do not introduce a global store for state that belongs to one page.

If the same UI state must be readable across multiple unrelated subtrees, lift it to a Context provider colocated with that segment. See [Context First, Zustand Last](./state-context-first-over-zustand.md) for when Context is enough and when Zustand is justified.

Do not store in this layer:

- server data (use RSC props or TanStack Query)
- form drafts (use Mantine `useForm` / form state)
- auth/session authority (server-only DAL is the source of truth)
- data shareable via URL (use `useSearchParams`)

**Incorrect (Zustand or Context for state owned by one route):**

```ts
const useWorkItemsUiStore = create(() => ({
  selectedIds: new Set<string>(),
  drawerOpened: false,
}));
```

**Correct (feature-local hook):**

```ts
type State = { selectedIds: Set<string>; drawerOpened: boolean };
type Action = { type: "select"; id: string } | { type: "toggleDrawer" };

export function useWorkItemsUiState() {
  return useReducer(reducer, { selectedIds: new Set(), drawerOpened: false });
}
```

Reference: React state placement; React 19 `useReducer`.
