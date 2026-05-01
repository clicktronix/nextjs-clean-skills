# Zustand For Page UI State

**Impact: MEDIUM**

Use Zustand for page-level UI state shared across client islands.

Good cases:
- selected rows
- drawer open state
- multi-panel UI coordination
- local sort mode not stored in URL

Do not store:
- server data
- form drafts
- auth/session authority
- data that should be shareable via URL

Keep route-local stores under the owning segment `_internal/stores`.

**Incorrect (server data copied into Zustand):**
```ts
const useStore = create(() => ({
  workItems: [],
  setWorkItems: (workItems) => ({ workItems }),
}))
```

**Correct (Zustand owns UI state only):**
```ts
const useWorkItemsUiStore = create(() => ({
  selectedIds: new Set<string>(),
  drawerOpened: false,
}))
```

Reference: React state placement and server-state separation.
